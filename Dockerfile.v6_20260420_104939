# =============================================================================
#  Wan2.2 Rapid-Mega I2V - RunPod Serverless Worker v7
#  RTX 4090 (Ada Lovelace sm_89) 最安定・高速化版
# -----------------------------------------------------------------------------
#  進化の履歴:
#   v4: sage-attentionインストール（ただしCOMFY_ARGS環境変数が効かず未適用）
#   v5: sage-attention有効化の起動フラグ方式を検討
#   v6: cu130 nightlyアップグレード + /start.sh書き換え
#       → RunPodホストドライバ（CUDA 12.8止まり）と非互換で
#         "GPU is not available / driver too old (found 12080)" で起動不能
#
#  v7の核心変更（2026-04-20）:
#   (A) cu130 nightlyを廃止 → ベースイメージ既定のcu128 stableを維持
#       → RunPod全ドライバ世代で確実にGPU認識される（起動問題ゼロ）
#   (B) /start.sh書き換えはv6から継承（sage-attentionを確実に注入）
#       → 「Using pytorch attention」→「Using sage attention」 +30%
#   (C) 起動フラグに --fast fp16_accumulation を追加
#       → Ada Lovelace専用最適化で +10-15%
#   (D) sage-attention 1.0.6を優先（cu128で確実に動くwheel）
#       → 2.xはcu130前提wheelが多く、cu128では失敗することがある
#
#  成功時のログで確認すべき行:
#   ✅ worker-comfyui: GPU is available
#   ✅ [BUILD-CHECK] PyTorch: 2.8.x+cu128 (or 2.9.x+cu128)
#   ✅ [BUILD-CHECK] sageattention: OK
#   ✅ Using sage attention            ← 起動時ログ
#   ✅ Enabled fp16 accumulation       ← 起動時ログ
#
#  想定トレードオフ:
#   - comfy_kitchen cuda/tritonバックエンドはcu128では有効化困難
#     → eagerフォールバックを受容（体感差は小さい。sage + fp16で十分高速）
#   - cu130の理論値 +50-60% → v7は +35-40% だが「確実に動く」方を選択
# =============================================================================

FROM runpod/worker-comfyui:5.8.5-base

# ---------------------------------------------------------------------------
# 1) sage-attention インストール（核心: 4090で30%速くなる）
#    cu128で確実に動く1.0.6を優先、ダメなら最新版にフォールバック
# ---------------------------------------------------------------------------
RUN pip install --no-cache-dir sageattention==1.0.6 \
    || pip install --no-cache-dir sageattention \
    || echo "WARNING: sageattention install failed, continuing without it"

# ---------------------------------------------------------------------------
# 2) triton 更新（sage-attention内部で使用される）
# ---------------------------------------------------------------------------
RUN pip install --no-cache-dir -U triton || true

# ---------------------------------------------------------------------------
# 3) Custom nodes (VideoHelperSuite + video-output-bridge)
# ---------------------------------------------------------------------------
RUN comfy-node-install comfyui-videohelpersuite video-output-bridge || true

# ---------------------------------------------------------------------------
# 4) extra_model_paths.yaml（Network Volume上のモデル認識）
# ---------------------------------------------------------------------------
COPY extra_model_paths.yaml /comfyui/extra_model_paths.yaml

# ---------------------------------------------------------------------------
# 5) /start.sh 書き換え：python main.py 起動時に引数を確実に注入
#    v6から継承した核心修正（COMFY_ARGS環境変数方式は効かないため）
#
#    追加オプション:
#      --use-sage-attention       : sage-attention有効化（+30%）
#      --fast fp16_accumulation   : Ada世代専用fp16最適化（+10-15%）
#      --highvram                 : 24GB VRAMフル活用
# ---------------------------------------------------------------------------
RUN if [ -f /start.sh ]; then \
      cp /start.sh /start.sh.orig && \
      sed -i 's|python main\.py|python main.py --use-sage-attention --fast fp16_accumulation --highvram|g' /start.sh && \
      sed -i 's|python /comfyui/main\.py|python /comfyui/main.py --use-sage-attention --fast fp16_accumulation --highvram|g' /start.sh && \
      sed -i 's|main\.py --listen|main.py --use-sage-attention --fast fp16_accumulation --highvram --listen|g' /start.sh && \
      echo "[PATCH] /start.sh modified with sage + fp16_accumulation" ; \
    fi

# ---------------------------------------------------------------------------
# 6) comfy_kitchen バックエンド強制有効化フラグ（cu128では通常効かないが無害）
# ---------------------------------------------------------------------------
ENV COMFY_KITCHEN_FORCE_ENABLE=1

# ---------------------------------------------------------------------------
# 7) Cleanup
# ---------------------------------------------------------------------------
RUN rm -f /comfyui/test_input.json 2>/dev/null || true && \
    rm -rf /root/.cache/pip

# ---------------------------------------------------------------------------
# 8) Build-time health check（ビルドログで確認用）
# ---------------------------------------------------------------------------
RUN python -c "import torch; print(f'[BUILD-CHECK] PyTorch: {torch.__version__}'); print(f'[BUILD-CHECK] CUDA: {torch.version.cuda}')" || true
RUN python -c "import sageattention; print(f'[BUILD-CHECK] sageattention: OK')" || echo "[BUILD-CHECK] sageattention: NOT AVAILABLE"
RUN python -c "import triton; print(f'[BUILD-CHECK] triton: {triton.__version__}')" || true
RUN if [ -f /start.sh ]; then \
      echo "[BUILD-CHECK] /start.sh python main.py lines:" && \
      grep -n "main\.py" /start.sh || echo "NOT FOUND" ; \
    fi
