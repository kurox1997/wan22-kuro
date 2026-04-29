# =============================================================================
#  DaSiWa WAN2.2 I2V Lightspeed v10 - RunPod Serverless Worker v9.0
#  過去v8.3で実証済の構成を踏襲: cu130 nightly + KJNodes + PathchSageAttentionKJ
# -----------------------------------------------------------------------------
#  核心:
#   - --use-sage-attention 起動フラグは削除 (Wan/Qwenで黒画面になる公式罠)
#   - 代わりに ComfyUI-KJNodes の PathchSageAttentionKJ ノードを workflow に注入
#     (backend: "auto" で sageattention 1.0.6 / 2.x 両対応)
#   - cu130 nightly で comfy_kitchen cuda backend 有効化 (Backend cuda selected)
#   - Triton JIT のための gcc/g++/python3-dev 等を完備 (過去のv8.0/v8.1/v8.2 失敗を全て回避)
# =============================================================================

FROM runpod/worker-comfyui:5.8.5-base

# ---------------------------------------------------------------------------
# 1) ビルド依存 (Triton JIT, sageattention のC拡張ビルド用)
# ---------------------------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential cmake git wget ffmpeg python3-dev libc6-dev \
    && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
# 2) コンパイラ環境変数 (Triton が gcc を確実に見つけるため)
# ---------------------------------------------------------------------------
ENV CC=/usr/bin/gcc
ENV CXX=/usr/bin/g++
ENV TRITON_CACHE_DIR=/tmp/triton_cache

# ---------------------------------------------------------------------------
# 3) PyTorch cu130 nightly (cu130失敗時はcu128にフォールバック)
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
# 5) SageAttention (PyPI最新 1.0.6 が入る、KJNodesの "auto" backend で動く)
# ---------------------------------------------------------------------------
RUN pip install --no-cache-dir -U sageattention || \
    pip install --no-cache-dir sageattention==1.0.6

# ---------------------------------------------------------------------------
# 6) KJNodes (PathchSageAttentionKJ ノードのため必須)
# ---------------------------------------------------------------------------
RUN (comfy-node-install comfyui-kjnodes) || \
    (cd /comfyui/custom_nodes && \
     git clone --depth 1 https://github.com/kijai/ComfyUI-KJNodes.git && \
     pip install --no-cache-dir -r ComfyUI-KJNodes/requirements.txt 2>/dev/null || true)

# ---------------------------------------------------------------------------
# 7) ComfyUI-VideoHelperSuite (VHS_VideoCombine)
# ---------------------------------------------------------------------------
RUN cd /comfyui/custom_nodes && \
    git clone --depth 1 https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite && \
    pip install --no-cache-dir -r ComfyUI-VideoHelperSuite/requirements.txt

# ---------------------------------------------------------------------------
# 8) Network Volume モデルパス認識
# ---------------------------------------------------------------------------
COPY extra_model_paths.yaml /comfyui/extra_model_paths.yaml

# ---------------------------------------------------------------------------
# 9) main.py パッチ
#     --use-sage-attention は注入しない (Wan黒画面の罠回避)
#     --fast fp16_accumulation --highvram のみ
#     sage本体は workflow の PathchSageAttentionKJ ノード経由で適用
# ---------------------------------------------------------------------------
RUN python3 << 'PYEOF'
content = open('/comfyui/main.py').read()
patch = """# === [v9.0 PATCH] fast args auto-inject ===
import sys as _sys_v90
_args_v90 = ['--fast', 'fp16_accumulation', '--highvram']
for _arg in reversed(_args_v90):
    if _arg not in _sys_v90.argv:
        _sys_v90.argv.insert(1, _arg)
print(f'[v9.0 PATCH] argv = {_sys_v90.argv}')
# === [v9.0 PATCH] end ===

"""
if 'v9.0 PATCH' not in content:
    open('/comfyui/main.py', 'w').write(patch + content)
    print('[BUILD] main.py PATCHED (no --use-sage-attention)')
else:
    print('[BUILD] main.py already patched')
PYEOF

# ---------------------------------------------------------------------------
# 10) /start.sh sed (保険)
# ---------------------------------------------------------------------------
RUN if [ -f /start.sh ]; then \
      sed -i 's|main\.py --listen|main.py --fast fp16_accumulation --highvram --listen|g' /start.sh ; \
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
RUN ls /usr/include/python3.12/Python.h && echo "[BUILD-CHECK] Python.h OK" || echo "[BUILD-CHECK] Python.h MISSING"
RUN ls /comfyui/custom_nodes/ | grep -iE "kjnodes|videohelper" || echo "[BUILD-CHECK] custom nodes MISSING"
RUN echo "[BUILD-CHECK] TRITON_CACHE_DIR=$TRITON_CACHE_DIR"
RUN echo "[BUILD-CHECK] main.py first 8 lines:" && head -8 /comfyui/main.py
