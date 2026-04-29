# =============================================================================
#  DaSiWa WAN2.2 I2V Lightspeed v10 - RunPod Serverless Worker
#  RTX 4090 高速化版 v2 (修正版)
# -----------------------------------------------------------------------------
#  修正点 v2 (2026-04-29):
#   - sageattention v1.0.6 (PyPI最新版) を確実にインストール
#     ※ v2.2.0 は PyPI 不在のため指定不可、--use-sage-attention で v1 も有効化される
#   - SpargeAttention は削除 (PyPI不在、CUDA toolkit必要なため見送り)
#   - VideoHelperSuite を git clone 直接方式に変更 (comfy-node-install のハング回避)
# -----------------------------------------------------------------------------
#  ベース:   runpod/worker-comfyui:5.8.5-base
#  高速化:   SageAttention v1.0.6 (--use-sage-attention) -> 約20-25%短縮
#  ノード:   ComfyUI-VideoHelperSuite (VHS_VideoCombine)
#  モデル:   Network Volume /runpod-volume/runpod-slim/ComfyUI/ から読込
# =============================================================================

FROM runpod/worker-comfyui:5.8.5-base

# 1) Triton 最新版 (SageAttention の前提)
RUN pip install --no-cache-dir -U triton

# 2) SageAttention (PyPI最新 v1.0.6 - 4090でも --use-sage-attention で有効化)
RUN pip install --no-cache-dir sageattention

# 3) ComfyUI-VideoHelperSuite (git clone 直接方式)
RUN cd /comfyui/custom_nodes && \
    git clone --depth 1 https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite && \
    pip install --no-cache-dir -r ComfyUI-VideoHelperSuite/requirements.txt

# 4) Network Volume モデルパス認識
COPY extra_model_paths.yaml /comfyui/extra_model_paths.yaml

# 5) ComfyUI 起動オプション (4090最適化)
ENV COMFY_ARGS="--use-sage-attention --fast --highvram"

# 6) クリーンアップ
RUN rm -rf /root/.cache/pip

# 7) ビルド時ヘルスチェック (失敗してもビルド続行)
RUN python -c "import torch; print(f'[OK] PyTorch {torch.__version__}, CUDA {torch.version.cuda}')" || true
RUN python -c "import sageattention; print('[OK] SageAttention')" || echo "[WARN] SageAttention import failed"
