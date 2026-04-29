# wan22-kuro - DaSiWa WAN2.2 I2V Lightspeed v10 (RunPod Serverless)

## 構成
- ベース: `runpod/worker-comfyui:5.8.5-base`
- 高速化: SageAttention 2.2 + SpargeAttention (任意) + `--fast --highvram`
- カスタムノード: ComfyUI-VideoHelperSuite (VHS_VideoCombine)
- モデル: Network Volume `/runpod-volume/runpod-slim/ComfyUI/` から読込

## 必要モデル (Network Volumeに事前配置)

| ファイル | 配置先 | サイズ |
|---|---|---|
| `Dasiwa_Lightspeedboundbitev10High.safetensors` | `models/diffusion_models/` | 約14GB |
| `Dasiwa_Lightspeedboundbitev10Low.safetensors` | `models/diffusion_models/` | 約14GB |
| `wan_2.1_vae.safetensors` | `models/vae/` | 約500MB |
| `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | `models/text_encoders/` | 約7GB |
| `DR34ML4Y_HIGH.safetensors` | `models/loras/` | 数百MB |
| `DR34ML4Y_LOW.safetensors` | `models/loras/` | 数百MB |

**重要**: ComfyUIワークフローで参照しているファイル名と Network Volume 上のファイル名は**完全一致**させること。

## デプロイ手順 (RunPod-native GitHub build)

1. RunPod Console → Serverless → New Endpoint
2. **Deploy from GitHub** を選択
3. リポジトリ: `kurox1997/wan22-kuro` (Dockerfileタイプ)
4. Branch: `main`、Dockerfile path: `Dockerfile`
5. GPU: 24GB VRAM (RTX 4090 / L40S)
6. Active Workers: 0、Max Workers: 1
7. Container Disk: 20GB
8. Network Volume: 既存ボリュームを選択 (`/runpod-volume`)
9. Environment Variables: `COMFY_ARGS=--use-sage-attention --fast --highvram`
10. Deploy → 初回ビルド15-20分
