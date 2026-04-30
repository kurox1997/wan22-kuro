# syntax=docker/dockerfile:1.4
# =============================================================================
#  DaSiWa WAN2.2 I2V Lightspeed v10 - RunPod Serverless Worker v9.6
#  v9.5 で OOM 解消・191秒で完走確認、ただし動画が API 応答に含まれない問題を解決
# -----------------------------------------------------------------------------
#  v9.6 修正点 (2026-04-30):
#   - logs__39 で v9.5 が完璧に動作 (191秒で完走、fp8+sage+reserve-vram 効いた)
#   - しかし worker-comfyui が VHS_VideoCombine の "gifs" キーを無視
#     → "WARNING: Node 16 produced unhandled output keys: ['gifs']"
#     → "Job completed. Returning 0 image(s)"
#   - 動画は ComfyUI 内に保存されているのに API 応答に含まれない
#   - 解決: worker-comfyui の handler.py に gifs キーサポートを追加するパッチ
#
#  保持機能 (v9.5から継続):
#   ✅ fp8 ロード (model weight dtype torch.float8_e4m3fn)
#   ✅ comfy_kitchen cuda backend
#   ✅ sage attention auto
#   ✅ --reserve-vram 2.0 + --cache-classic
#   ✅ PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
# =============================================================================

FROM runpod/worker-comfyui:5.8.5-base

# ---------------------------------------------------------------------------
# 1) ビルド依存
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
# 3) PyTorch メモリ断片化対策
# ---------------------------------------------------------------------------
ENV PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True,max_split_size_mb:512

# ---------------------------------------------------------------------------
# 4) PyTorch cu130 nightly (cu128 fallback)
# ---------------------------------------------------------------------------
RUN pip uninstall -y torch torchvision torchaudio xformers 2>/dev/null || true && \
    (pip install --no-cache-dir --pre \
        torch torchvision torchaudio \
        --index-url https://download.pytorch.org/whl/nightly/cu130 \
     || pip install --no-cache-dir --pre \
        torch torchvision torchaudio \
        --index-url https://download.pytorch.org/whl/nightly/cu128)

# ---------------------------------------------------------------------------
# 5) Triton 最新版
# ---------------------------------------------------------------------------
RUN pip install --no-cache-dir -U triton

# ---------------------------------------------------------------------------
# 6) SageAttention 1.0.6
# ---------------------------------------------------------------------------
RUN pip install --no-cache-dir -U sageattention || \
    pip install --no-cache-dir sageattention==1.0.6

# ---------------------------------------------------------------------------
# 7) KJNodes
# ---------------------------------------------------------------------------
RUN (comfy-node-install comfyui-kjnodes) || \
    (cd /comfyui/custom_nodes && \
     git clone --depth 1 https://github.com/kijai/ComfyUI-KJNodes.git && \
     pip install --no-cache-dir -r ComfyUI-KJNodes/requirements.txt 2>/dev/null || true)

# ---------------------------------------------------------------------------
# 8) ComfyUI-VideoHelperSuite
# ---------------------------------------------------------------------------
RUN cd /comfyui/custom_nodes && \
    git clone --depth 1 https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite && \
    pip install --no-cache-dir -r ComfyUI-VideoHelperSuite/requirements.txt

# ---------------------------------------------------------------------------
# 9) Network Volume モデルパス認識
# ---------------------------------------------------------------------------
COPY extra_model_paths.yaml /comfyui/extra_model_paths.yaml

# ---------------------------------------------------------------------------
# 10) main.py パッチ (v9.6: 起動引数注入)
# ---------------------------------------------------------------------------
COPY patch_main.py /tmp/patch_main.py
RUN python3 /tmp/patch_main.py && rm -f /tmp/patch_main.py

# ---------------------------------------------------------------------------
# 11) [v9.6 新規] worker-comfyui の handler.py に gifs キー対応パッチ
#     これで VHS_VideoCombine の MP4 出力が API 応答に含まれる
# ---------------------------------------------------------------------------
COPY patch_handler.py /tmp/patch_handler.py
RUN python3 /tmp/patch_handler.py && rm -f /tmp/patch_handler.py

# ---------------------------------------------------------------------------
# 12) /start.sh sed (v9.6: --reserve-vram 2.0 --cache-classic)
# ---------------------------------------------------------------------------
RUN if [ -f /start.sh ]; then \
      sed -i 's|main\.py --listen|main.py --fast fp16_accumulation --reserve-vram 2.0 --cache-classic --listen|g' /start.sh ; \
    fi

# ---------------------------------------------------------------------------
# 13) クリーンアップ
# ---------------------------------------------------------------------------
RUN rm -rf /root/.cache/pip

# ---------------------------------------------------------------------------
# 14) BUILD-CHECK
# ---------------------------------------------------------------------------
RUN python -c "import torch; print(f'[BUILD-CHECK] PyTorch {torch.__version__}, CUDA {torch.version.cuda}')" || true
RUN python -c "import sageattention; print('[BUILD-CHECK] sageattention OK')" || echo "[BUILD-CHECK] sage NOT AVAILABLE"
RUN python -c "import triton; print(f'[BUILD-CHECK] triton {triton.__version__}')" || true
RUN gcc --version | head -1 && echo "[BUILD-CHECK] gcc OK" || echo "[BUILD-CHECK] gcc NOT FOUND"
RUN ls /comfyui/custom_nodes/ | grep -iE "kjnodes|videohelper" || echo "[BUILD-CHECK] custom nodes MISSING"
RUN echo "[BUILD-CHECK] PYTORCH_CUDA_ALLOC_CONF=$PYTORCH_CUDA_ALLOC_CONF"

# handler.py パッチ適用確認
RUN find / -name "handler.py" 2>/dev/null | xargs grep -l "v9.6 GIFS PATCH" 2>/dev/null && \
    echo "[BUILD-CHECK] handler.py GIFS PATCH applied" || \
    echo "[BUILD-CHECK] handler.py GIFS PATCH NOT applied (may need manual inspection)"
