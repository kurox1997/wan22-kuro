# =============================================================================
#  Wan2.2 Rapid-Mega I2V - RunPod Serverless Worker v8
#  4090最速構成 - コミュニティ事例統合版
# -----------------------------------------------------------------------------
#  進化の履歴:
#   v6: cu130 nightly + /start.sh書き換え → driver too oldで起動不能（ガチャ次第）
#   v7: cu128 stable + /start.sh書き換え → 動くが comfy_kitchen cuda disabled
#   今回ログ(logs__22_.txt)検証: v6のままでも新ドライバホスト引き当てで動作
#       → Backend cuda selected for apply_rope1 ✅
#       → しかし Using pytorch attention ❌ (sage-attentionが効いていない)
#
#  v8の核心変更（2026-04-20、コミュニティ事例3点を統合）:
#
#   (A) --use-sage-attention 起動フラグを削除
#       根拠: ComfyUI公式Discussion #11583 および mobcat40/sageattention-blackwell:
#             "Don't use --use-sage-attention flag - it uses the Triton backend
#              which causes BLACK OUTPUT with some models (Qwen, Wan)"
#       → Wan 2.2では起動フラグ方式は黒画面を生む罠
#
#   (B) sageattention 最新版(2.x)を優先インストール
#       根拠: CivitAI "Wan 2.2 SVI Pro 2.0" (1.2、週間DL数多数):
#             "sageattention-2.2.0.post3+cu130torch2.9.0" + KJNodes で40秒短縮
#             PyPI 1.0.6 は outdated で black output 報告多数
#       → 2.x対応wheelを優先、失敗時のみ1.0.6にfallback
#
#   (C) ComfyUI-KJNodes を custom node として追加
#       根拠: DCAIブログ(digitalcreativeai.net) + Civitai SVI Pro事例:
#             "Patch Sage Attention KJ ノードをModelSamplingSD3の前に配置"
#             backend: sageattn_qk_int8_pv_fp16_cuda (4090 sm_89 最適)
#       → worker.js側でWORKFLOW_TEMPLATEにノード注入するためにKJNodesが必須
#
#  想定効果（コミュニティ実測ベース）:
#   現状(v6、cuda backend only)      : 基準の 125-130%
#   v8 (cuda backend + sage + fp16)  : 基準の 160-180%
#   → 10秒動画生成で 30-50秒短縮見込み
#
#  保持する要素:
#   - cu130 nightly（comfy_kitchen cuda backendの +20-30%）
#   - --fast fp16_accumulation（Ada世代専用、ComfyUI本体機能で安全、+10-15%）
#   - --highvram（24GB VRAM活用）
#   - /start.sh書き換え（起動引数注入の唯一確実な方法）
#
#  検証ポイント(ビルドログ/起動ログ):
#   [BUILD-CHECK] PyTorch: 2.x+cu130
#   [BUILD-CHECK] sageattention: OK (2.x)
#   [BUILD-CHECK] KJNodes: OK
#   [PATCH] /start.sh modified
#   起動時: Enabled fp16 accumulation
#   (sage attentionは起動ログではなく、ジョブ実行時にKJNodesノード経由で有効化される)
# =============================================================================

FROM runpod/worker-comfyui:5.8.5-base

# ---------------------------------------------------------------------------
# 1) PyTorch cu130 nightly（comfy_kitchen cuda backend有効化のため維持）
#    前回ログで apply_rope1 が cuda backend に乗っていることを確認済み
# ---------------------------------------------------------------------------
RUN pip install --no-cache-dir --upgrade --pre \
    torch torchvision torchaudio \
    --index-url https://download.pytorch.org/whl/nightly/cu130 \
    || echo "WARNING: cu130 nightly install failed, keeping base image pytorch"

# ---------------------------------------------------------------------------
# 2) sageattention 2.x 優先インストール（1.0.6はblack output問題あり）
#    PyPIは頻繁に更新されるため、ソースビルドが最も確実
#    順序: (a) pip最新 → (b) GitHub直 → (c) 1.0.6 fallback
# ---------------------------------------------------------------------------
RUN pip install --no-cache-dir -U sageattention \
    || pip install --no-cache-dir --no-build-isolation git+https://github.com/thu-ml/SageAttention.git \
    || pip install --no-cache-dir sageattention==1.0.6 \
    || echo "WARNING: All sageattention install attempts failed"

# ---------------------------------------------------------------------------
# 3) triton 最新版（sageattention内部で使用）
# ---------------------------------------------------------------------------
RUN pip install --no-cache-dir -U triton || true

# ---------------------------------------------------------------------------
# 4) Custom nodes
#    - VideoHelperSuite + video-output-bridge（既存、v6から継承）
#    - ComfyUI-KJNodes（v8新規、Patch Sage Attentionノード用）
# ---------------------------------------------------------------------------
RUN comfy-node-install comfyui-videohelpersuite video-output-bridge || true

# KJNodesはcomfy-node-installにない場合があるためgit clone方式も用意
RUN comfy-node-install comfyui-kjnodes \
    || (cd /comfyui/custom_nodes && \
        git clone https://github.com/kijai/ComfyUI-KJNodes.git && \
        cd ComfyUI-KJNodes && \
        pip install --no-cache-dir -r requirements.txt) \
    || echo "WARNING: KJNodes install failed"

# ---------------------------------------------------------------------------
# 5) extra_model_paths.yaml
# ---------------------------------------------------------------------------
COPY extra_model_paths.yaml /comfyui/extra_model_paths.yaml

# ---------------------------------------------------------------------------
# 6) /start.sh 書き換え：python main.py に起動引数を確実に注入
#
#    v8変更点: --use-sage-attention を削除（Wan 2.2 black output対策）
#    代わりに KJNodes の Patch Sage Attention ノードをworker.js側で注入
#
#    注入する引数:
#      --fast fp16_accumulation   : Ada世代fp16最適化（+10-15%）
#      --highvram                 : 24GB VRAMフル活用
# ---------------------------------------------------------------------------
RUN if [ -f /start.sh ]; then \
      cp /start.sh /start.sh.orig && \
      sed -i 's|python main\.py|python main.py --fast fp16_accumulation --highvram|g' /start.sh && \
      sed -i 's|python /comfyui/main\.py|python /comfyui/main.py --fast fp16_accumulation --highvram|g' /start.sh && \
      sed -i 's|main\.py --listen|main.py --fast fp16_accumulation --highvram --listen|g' /start.sh && \
      echo "[PATCH] /start.sh modified with fp16_accumulation + highvram (no --use-sage-attention)" ; \
    fi

# ---------------------------------------------------------------------------
# 7) comfy_kitchen バックエンド強制有効化（cu130 + sm_89で有効）
# ---------------------------------------------------------------------------
ENV COMFY_KITCHEN_FORCE_ENABLE=1

# ---------------------------------------------------------------------------
# 8) Cleanup
# ---------------------------------------------------------------------------
RUN rm -f /comfyui/test_input.json 2>/dev/null || true && \
    rm -rf /root/.cache/pip

# ---------------------------------------------------------------------------
# 9) Build-time health check
# ---------------------------------------------------------------------------
RUN python -c "import torch; print(f'[BUILD-CHECK] PyTorch: {torch.__version__}'); print(f'[BUILD-CHECK] CUDA: {torch.version.cuda}')" || true
RUN python -c "import sageattention; print(f'[BUILD-CHECK] sageattention: OK (version={getattr(sageattention, \"__version__\", \"unknown\")})'); print(f'[BUILD-CHECK] sageattention backends: {[a for a in dir(sageattention) if a.startswith(\"sageattn\")]}')" || echo "[BUILD-CHECK] sageattention: NOT AVAILABLE"
RUN python -c "import triton; print(f'[BUILD-CHECK] triton: {triton.__version__}')" || true
RUN if [ -d /comfyui/custom_nodes/ComfyUI-KJNodes ]; then \
      echo "[BUILD-CHECK] KJNodes: OK (installed via git)"; \
    elif [ -d /comfyui/custom_nodes/comfyui-kjnodes ]; then \
      echo "[BUILD-CHECK] KJNodes: OK (installed via comfy-node-install)"; \
    else \
      echo "[BUILD-CHECK] KJNodes: NOT FOUND - Patch Sage Attention will be unavailable"; \
    fi
RUN if [ -f /start.sh ]; then \
      echo "[BUILD-CHECK] /start.sh python main.py lines:" && \
      grep -n "main\.py" /start.sh || echo "NOT FOUND" ; \
    fi
