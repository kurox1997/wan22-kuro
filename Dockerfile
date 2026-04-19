# =============================================================================
#  Wan2.2 Rapid-Mega I2V - RunPod Serverless Worker
#  RTX 4090 (Ada Lovelace sm_89) optimized v4
# =============================================================================

FROM runpod/worker-comfyui:5.8.5-base

# 1) sage-attention install (30% speedup on 4090)
RUN pip install --no-cache-dir sageattention==1.0.6 || \
    pip install --no-cache-dir sageattention || \
    echo "sageattention install failed, continuing without it"

# 2) triton update (for comfy_kitchen triton backend)
RUN pip install --no-cache-dir -U triton || true

# 3) Custom nodes (VideoHelperSuite + video-output-bridge)
RUN comfy-node-install comfyui-videohelpersuite video-output-bridge || true

# 4) extra_model_paths.yaml (Network Volume model recognition)
COPY extra_model_paths.yaml /comfyui/extra_model_paths.yaml

# 5) ComfyUI launch options (4090 optimized)
ENV COMFY_ARGS="--use-sage-attention --fast --highvram"

# 6) comfy_kitchen backend force enable
ENV COMFY_KITCHEN_FORCE_ENABLE=1

# 7) Cleanup
RUN rm -f /comfyui/test_input.json 2>/dev/null || true && \
    rm -rf /root/.cache/pip

# 8) Build-time health check
RUN python -c "import torch; print(f'PyTorch: {torch.__version__}'); print(f'CUDA: {torch.version.cuda}')" || true
