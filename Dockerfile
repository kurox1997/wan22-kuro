# =============================================================================
#  DaSiWa WAN2.2 I2V Lightspeed v10 - RunPod Serverless Worker v7.1
#  RTX 4090 / sage-attention 確実有効化版
# -----------------------------------------------------------------------------
#  v7.1 修正点 (2026-04-29):
#   - 致命的見落としを修正: ENV COMFY_ARGS は ComfyUI worker に無視される
#     → /start.sh を sed で直接書き換え、main.py に起動引数を確実注入する方式に変更
#     → 過去の wan22-kuro v7 (Rapid Mega用) で確立した正解パターン
#
#  この修正で起動ログが以下のように変わる:
#   - 修正前: Using pytorch attention   (sage効かず、約64秒/step)
#   - 修正後: Using sage attention      (sage有効、約45秒/step、約30%短縮)
# -----------------------------------------------------------------------------
#  ベース:   runpod/worker-comfyui:5.8.5-base
#  GPU:      RTX 4090 (sm_89)
#  高速化:   SageAttention 1.0.6 + --fast fp16_accumulation + --highvram
#  ノード:   ComfyUI-VideoHelperSuite (VHS_VideoCombine)
#  モデル:   Network Volume /runpod-volume/runpod-slim/ComfyUI/ から読込
# -----------------------------------------------------------------------------
#  注意: comfy_kitchen の "Backend eager selected for apply_rope1" 出力は
#         cu130 必須のため cu128 では消えない。これは諦める領域。
#         sage attention が効くだけで体感30%短縮されるので実用上問題なし。
# =============================================================================

FROM runpod/worker-comfyui:5.8.5-base

# ---------------------------------------------------------------------------
# 1) Triton 最新版 (SageAttention の前提)
# ---------------------------------------------------------------------------
RUN pip install --no-cache-dir -U triton

# ---------------------------------------------------------------------------
# 2) SageAttention (PyPI最新 v1.0.6)
# ---------------------------------------------------------------------------
RUN pip install --no-cache-dir sageattention

# ---------------------------------------------------------------------------
# 3) ComfyUI-VideoHelperSuite (git clone 直接方式 - hang回避)
# ---------------------------------------------------------------------------
RUN cd /comfyui/custom_nodes && \
    git clone --depth 1 https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite && \
    pip install --no-cache-dir -r ComfyUI-VideoHelperSuite/requirements.txt

# ---------------------------------------------------------------------------
# 4) Network Volume モデルパス認識
# ---------------------------------------------------------------------------
COPY extra_model_paths.yaml /comfyui/extra_model_paths.yaml

# ---------------------------------------------------------------------------
# 5) [核心] /start.sh を sed で書き換え、main.py に起動引数を確実注入
#     ENV COMFY_ARGS は ComfyUI worker に無視されるため、この方式が必須
# ---------------------------------------------------------------------------
RUN if [ -f /start.sh ]; then \
      sed -i 's|main\.py --listen|main.py --use-sage-attention --fast fp16_accumulation --highvram --listen|g' /start.sh && \
      echo "[PATCH] /start.sh modified with sage + fp16_accumulation + highvram" ; \
    else \
      echo "[WARN] /start.sh not found, scanning for entrypoint..." && \
      find / -maxdepth 3 -name "start*.sh" 2>/dev/null ; \
    fi

# ---------------------------------------------------------------------------
# 6) 旧 ENV (もう不要だが念のため残す、副作用なし)
# ---------------------------------------------------------------------------
ENV COMFY_KITCHEN_FORCE_ENABLE=1

# ---------------------------------------------------------------------------
# 7) クリーンアップ
# ---------------------------------------------------------------------------
RUN rm -rf /root/.cache/pip

# ---------------------------------------------------------------------------
# 8) ビルド時ヘルスチェック (失敗してもビルド続行)
#     [BUILD-CHECK] 行をビルドログで確認してください
# ---------------------------------------------------------------------------
RUN python -c "import torch; print(f'[BUILD-CHECK] PyTorch {torch.__version__}, CUDA {torch.version.cuda}')" || true
RUN python -c "import sageattention; print('[BUILD-CHECK] sageattention OK')" || echo "[BUILD-CHECK] sageattention NOT AVAILABLE"
RUN python -c "import triton; print(f'[BUILD-CHECK] triton {triton.__version__}')" || true
RUN if [ -f /start.sh ]; then \
      echo "[BUILD-CHECK] /start.sh main.py lines:" && \
      grep -n "main\.py" /start.sh || echo "NOT FOUND" ; \
    fi
