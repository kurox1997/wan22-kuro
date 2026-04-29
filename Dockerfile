# =============================================================================
#  DaSiWa WAN2.2 I2V Lightspeed v10 - RunPod Serverless Worker
#  RTX 4090 (Ada Lovelace sm_89) 高速化版
# -----------------------------------------------------------------------------
#  ベース: runpod/worker-comfyui:5.8.5-base
#  高速化:
#   - SageAttention 2.2 (Triton+INT8) -> 約38%短縮
#   - SpargeAttention (sparse attn)   -> SageAttn上に乗せて累積50%短縮 (任意)
#   - --use-sage-attention --fast --highvram
#  カスタムノード: ComfyUI-VideoHelperSuite (VHS_VideoCombine)
#  モデル: Network Volume /runpod-volume/runpod-slim/ComfyUI/ から読込
# -----------------------------------------------------------------------------
#  ビルド方式: RunPod Console の "Deploy from GitHub" を使用
#   GitHub Actions (.github/workflows) は不要、ghcr.io 不要
# =============================================================================

FROM runpod/worker-comfyui:5.8.5-base

# 1) Triton 最新版 (SageAttn / SpargeAttn の前提)
RUN pip install --no-cache-dir -U triton

# 2) SageAttention 2.2 (確実に入れる、画質劣化なし -38%)
RUN pip install --no-cache-dir sageattention==2.2.0 || \
    pip install --no-cache-dir sageattention

# 3) SpargeAttention (累積 -50%, ビルド失敗時はSageAttnのみで継続)
#    GitHub源ビルドは CUDA toolkit が必要なため、PyPI wheel優先
RUN pip install --no-cache-dir spas-sage-attn 2>/dev/null || \
    pip install --no-cache-dir spas_sage_attn 2>/dev/null || \
    echo "[WARN] SpargeAttention install failed, falling back to SageAttention only"

# 4) カスタムノード: VHS_VideoCombine
RUN comfy-node-install comfyui-videohelpersuite

# 5) Network Volume モデルパス認識
COPY extra_model_paths.yaml /comfyui/extra_model_paths.yaml

# 6) ComfyUI 起動オプション (4090最適化)
#    --use-sage-attention : SageAttn 2.2バックエンド有効化
#    --fast               : fp16 accumulation
#    --highvram           : VRAM 24GB活用
ENV COMFY_ARGS="--use-sage-attention --fast --highvram"

# 7) クリーンアップ
RUN rm -rf /root/.cache/pip

# 8) ビルド時ヘルスチェック (失敗してもビルド続行)
RUN python -c "import torch; print(f'[OK] PyTorch {torch.__version__}, CUDA {torch.version.cuda}')" || true
RUN python -c "import sageattention; print('[OK] SageAttention')" || echo "[WARN] SageAttention import failed"
RUN python -c "import spas_sage_attn; print('[OK] SpargeAttention')" || echo "[INFO] SpargeAttention not available (fallback to SageAttn)"
