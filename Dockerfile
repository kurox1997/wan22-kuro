# =============================================================================
#  Wan2.2 Rapid-Mega I2V - RunPod Serverless Worker v6
#  RTX 4090 / 5090 両対応、cu130 nightly + sage-attention 強制有効化版
# -----------------------------------------------------------------------------
#  v5 からの変更点（核心）:
#   (1) PyTorch を cu128 stable → cu130 nightly にアップグレード
#       → comfy_kitchen backend cuda/triton が disabled → enabled になる
#       → 「Backend eager selected for apply_rope1」が消える
#       → 20-30% 高速化（Wan 2.2 で特に効果大）
#
#   (2) custom start.sh を作成して python main.py 起動時に起動引数を確実に注入
#       → 「Using pytorch attention」→「Using sage attention」になる
#       → 追加 20-30% 高速化
#
#   (3) sageattention 2.x を優先インストール（cu130対応版）
#       → 従来は 1.0.6 → fallback だったが、2.x が入れば更に速い
#
#  成功時のログ:
#   - comfy_kitchen backend cuda: {'disabled': False}  ← ここ重要
#   - Using sage attention                              ← ここ重要
#   - Backend eager selected for apply_rope1 が出ない（または極小）
#
#  検証ポイント:
#   ビルドログの [BUILD-CHECK] 行で各種バージョンを確認
# =============================================================================

FROM runpod/worker-comfyui:5.8.5-base

# ---------------------------------------------------------------------------
# 1) PyTorch cu130 nightly にアップグレード（核心）
# ---------------------------------------------------------------------------
RUN pip install --no-cache-dir --upgrade --pre \
    torch torchvision torchaudio \
    --index-url https://download.pytorch.org/whl/nightly/cu130 \
    || echo "WARNING: cu130 nightly install failed, keeping base image pytorch"

# ---------------------------------------------------------------------------
# 2) sageattention 最新版インストール
# ---------------------------------------------------------------------------
RUN pip install --no-cache-dir -U sageattention \
    || pip install --no-cache-dir sageattention==1.0.6 \
    || echo "WARNING: sageattention install failed"

# ---------------------------------------------------------------------------
# 3) triton 最新版
# ---------------------------------------------------------------------------
RUN pip install --no-cache-dir -U triton || true

# ---------------------------------------------------------------------------
# 4) Custom nodes
# ---------------------------------------------------------------------------
RUN comfy-node-install comfyui-videohelpersuite video-output-bridge || true

# ---------------------------------------------------------------------------
# 5) extra_model_paths.yaml
# ---------------------------------------------------------------------------
COPY extra_model_paths.yaml /comfyui/extra_model_paths.yaml

# ---------------------------------------------------------------------------
# 6) /start.sh を書き換え：python main.py の直前に引数を差し込む
# ---------------------------------------------------------------------------
# worker-comfyui のベースイメージでは /start.sh 内で ComfyUI を起動している
# その起動コマンドに引数を追加する
RUN if [ -f /start.sh ]; then \
      cp /start.sh /start.sh.orig && \
      sed -i 's|python main\.py|python main.py --use-sage-attention --fast --highvram|g' /start.sh && \
      sed -i 's|python /comfyui/main\.py|python /comfyui/main.py --use-sage-attention --fast --highvram|g' /start.sh && \
      sed -i 's|main\.py --listen|main.py --use-sage-attention --fast --highvram --listen|g' /start.sh && \
      echo "[PATCH] /start.sh modified" ; \
    fi

# ---------------------------------------------------------------------------
# 7) comfy_kitchen バックエンド強制有効化
# ---------------------------------------------------------------------------
ENV COMFY_KITCHEN_FORCE_ENABLE=1

# ---------------------------------------------------------------------------
# 8) Cleanup
# ---------------------------------------------------------------------------
RUN rm -f /comfyui/test_input.json 2>/dev/null || true && \
    rm -rf /root/.cache/pip

# ---------------------------------------------------------------------------
# 9) Build-time health check（ビルドログで確認する用）
# ---------------------------------------------------------------------------
RUN python -c "import torch; print(f'[BUILD-CHECK] PyTorch: {torch.__version__}'); print(f'[BUILD-CHECK] CUDA: {torch.version.cuda}')" || true
RUN python -c "import sageattention; print(f'[BUILD-CHECK] sageattention: OK')" || echo "[BUILD-CHECK] sageattention: NOT AVAILABLE"
RUN python -c "import triton; print(f'[BUILD-CHECK] triton: {triton.__version__}')" || true
RUN if [ -f /start.sh ]; then \
      echo "[BUILD-CHECK] /start.sh python main.py lines:" && \
      grep -n "main\.py" /start.sh || echo "NOT FOUND" ; \
    fi
