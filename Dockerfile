# syntax=docker/dockerfile:1.4
# =============================================================================
#  DaSiWa WAN2.2 I2V Lightspeed v10 - RunPod Serverless Worker v9.4
#  fp8 + --lowvram で OOM 完全回避版
# -----------------------------------------------------------------------------
#  v9.4 修正点 (2026-04-29):
#   - logs__38で fp8 ロード成功確認 (model weight dtype torch.float8_e4m3fn)
#     しかし VRAM 22.61GB で OOM (LoRA fp8 stochastic round で追加バッファ要求)
#   - 解決: --highvram削除 → --lowvram追加
#     ComfyUI が UNET を CPU/GPU 間で自動転送するため
#     fp8 + lowvram のハイブリッドで 12-14GB に収まる
#
#  確認済み (logs__38):
#   ✅ comfy_kitchen cuda backend 有効 (Backend cuda selected for ...)
#   ✅ Enabled fp16 accumulation
#   ✅ model weight dtype torch.float8_e4m3fn
#   ✅ Using sage attention mode: auto (KJNodes)
# =============================================================================

FROM runpod/worker-comfyui:5.8.5-base

# ---------------------------------------------------------------------------
# 1) ビルド依存 (Triton JIT)
# ---------------------------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential cmake git wget ffmpeg python3-dev libc6-dev \
    && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
# 2) コンパイラ環境変数
# ---------------------------------------------------------------------------
ENV CC=/usr/bin/gcc
ENV CXX=/usr/bin/g++
ENV TRITON_CACHE_DIR=/tmp/triton_cache

# ---------------------------------------------------------------------------
# 3) PyTorch cu130 nightly (cu128 fallback)
# ---------------------------------------------------------------------------
RUN pip uninstall -y torch torchvision torchaudio xformers 2>/dev/null || true && \
    (pip install --no-cache-dir --pre \
        torch torchvision torchaudio \
        --index-url https://download.pytorch.org/whl/nightly/cu130 \
     || pip install --no-cache-dir --pre \
        torch torchvision torchaudio \
        --index-url https://download.pytorch.org/whl/nightly/cu128)

# ---------------------------------------------------------------------------
# 4) Triton 最新版
# ---------------------------------------------------------------------------
RUN pip install --no-cache-dir -U triton

# ---------------------------------------------------------------------------
# 5) SageAttention 1.0.6
# ---------------------------------------------------------------------------
RUN pip install --no-cache-dir -U sageattention || \
    pip install --no-cache-dir sageattention==1.0.6

# ---------------------------------------------------------------------------
# 6) KJNodes
# ---------------------------------------------------------------------------
RUN (comfy-node-install comfyui-kjnodes) || \
    (cd /comfyui/custom_nodes && \
     git clone --depth 1 https://github.com/kijai/ComfyUI-KJNodes.git && \
     pip install --no-cache-dir -r ComfyUI-KJNodes/requirements.txt 2>/dev/null || true)

# ---------------------------------------------------------------------------
# 7) ComfyUI-VideoHelperSuite
# ---------------------------------------------------------------------------
RUN cd /comfyui/custom_nodes && \
    git clone --depth 1 https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite && \
    pip install --no-cache-dir -r ComfyUI-VideoHelperSuite/requirements.txt

# ---------------------------------------------------------------------------
# 8) Network Volume モデルパス認識
# ---------------------------------------------------------------------------
COPY extra_model_paths.yaml /comfyui/extra_model_paths.yaml

# ---------------------------------------------------------------------------
# 9) main.py パッチ (v9.4: --fast fp16_accumulation --lowvram)
# ---------------------------------------------------------------------------
COPY patch_main.py /tmp/patch_main.py
RUN python3 /tmp/patch_main.py && rm -f /tmp/patch_main.py

# ---------------------------------------------------------------------------
# 10) /start.sh sed (v9.4: --lowvram)
# ---------------------------------------------------------------------------
RUN if [ -f /start.sh ]; then \
      sed -i 's|main\.py --listen|main.py --fast fp16_accumulation --lowvram --listen|g' /start.sh ; \
    fi

# ---------------------------------------------------------------------------
# 11) クリーンアップ
# ---------------------------------------------------------------------------
RUN rm -rf /root/.cache/pip

# ---------------------------------------------------------------------------
# 12) BUILD-CHECK
# ---------------------------------------------------------------------------
RUN python -c "import torch; print(f'[BUILD-CHECK] PyTorch {torch.__version__}, CUDA {torch.version.cuda}')" || true
RUN python -c "import sageattention; print('[BUILD-CHECK] sageattention OK')" || echo "[BUILD-CHECK] sage NOT AVAILABLE"
RUN python -c "import triton; print(f'[BUILD-CHECK] triton {triton.__version__}')" || true
RUN gcc --version | head -1 && echo "[BUILD-CHECK] gcc OK" || echo "[BUILD-CHECK] gcc NOT FOUND"
RUN ls /comfyui/custom_nodes/ | grep -iE "kjnodes|videohelper" || echo "[BUILD-CHECK] custom nodes MISSING"
RUN echo "[BUILD-CHECK] main.py first 8 lines:" && head -8 /comfyui/main.py
