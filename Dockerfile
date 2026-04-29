# syntax=docker/dockerfile:1.4
# =============================================================================
#  DaSiWa WAN2.2 I2V Lightspeed v10 - RunPod Serverless Worker v9.5
#  包括ログ精査後の最適化版
# -----------------------------------------------------------------------------
#  v9.5 (2026-04-29) ログ精査による包括対策:
#
#  ログから確認できた事実 (logs__38_.txt):
#   ✅ fp8 ロード成功 (model weight dtype torch.float8_e4m3fn)
#   ✅ comfy_kitchen cuda backend 有効 (Backend cuda selected for fp8)
#   ✅ sage attention auto 動作 (Using sage attention mode: auto x2)
#   ✅ async weight offloading 2 streams 有効
#   ❌ KSampler 13 で OOM (22.61 GiB / 23.52 GiB allocated)
#   ❌ ComfyUI が自動的に lowvram モードに混合運用するも追いつかず
#
#  v9.5 で導入する追加対策:
#   --reserve-vram 2.0 : ComfyUI に常時2GB空き確保を強制
#                        → 積極的なCPUオフロード判断
#                        → --lowvram より速い (-5〜10% vs -25%)
#   --cache-classic    : メモリプール最適化 (断片化抑制)
#   --highvram 完全除去 : v9.1の名残を patch_main.py で削除
#
#  期待値:
#   v9.1 (失敗): VRAM 19.85 GiB → OOM
#   v9.4 (失敗): VRAM 22.61 GiB → OOM
#   v9.5: VRAM 18-20 GiB に抑制、150-180秒で完走見込み
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
# 3) PyTorch メモリ断片化対策 (PYTORCH_CUDA_ALLOC_CONF)
#    expandable_segments で OOM 直前の救済確率UP
#    max_split_size_mb で大ブロック確保時の断片化抑制
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
# 10) main.py パッチ (v9.5: reserve-vram 2.0 + cache-classic)
# ---------------------------------------------------------------------------
COPY patch_main.py /tmp/patch_main.py
RUN python3 /tmp/patch_main.py && rm -f /tmp/patch_main.py

# ---------------------------------------------------------------------------
# 11) /start.sh sed (v9.5)
# ---------------------------------------------------------------------------
RUN if [ -f /start.sh ]; then \
      sed -i 's|main\.py --listen|main.py --fast fp16_accumulation --reserve-vram 2.0 --cache-classic --listen|g' /start.sh ; \
    fi

# ---------------------------------------------------------------------------
# 12) クリーンアップ
# ---------------------------------------------------------------------------
RUN rm -rf /root/.cache/pip

# ---------------------------------------------------------------------------
# 13) BUILD-CHECK
# ---------------------------------------------------------------------------
RUN python -c "import torch; print(f'[BUILD-CHECK] PyTorch {torch.__version__}, CUDA {torch.version.cuda}')" || true
RUN python -c "import sageattention; print('[BUILD-CHECK] sageattention OK')" || echo "[BUILD-CHECK] sage NOT AVAILABLE"
RUN python -c "import triton; print(f'[BUILD-CHECK] triton {triton.__version__}')" || true
RUN gcc --version | head -1 && echo "[BUILD-CHECK] gcc OK" || echo "[BUILD-CHECK] gcc NOT FOUND"
RUN ls /comfyui/custom_nodes/ | grep -iE "kjnodes|videohelper" || echo "[BUILD-CHECK] custom nodes MISSING"
RUN echo "[BUILD-CHECK] PYTORCH_CUDA_ALLOC_CONF=$PYTORCH_CUDA_ALLOC_CONF"
RUN echo "[BUILD-CHECK] main.py first 8 lines:" && head -8 /comfyui/main.py
