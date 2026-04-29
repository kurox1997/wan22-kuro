"""
[v9.5] main.py パッチ - 包括チェック後の最適解
v9.4の --lowvram より速い --reserve-vram 2.0 方式を採用

ログ分析結果 (logs__38_.txt):
  ✅ fp8 ロード成功 (model weight dtype torch.float8_e4m3fn)
  ✅ comfy_kitchen cuda backend 有効
  ✅ sage attention auto 有効
  ✅ Using async weight offloading with 2 streams
  ❌ KSampler 13 で OOM (22.61 GiB / 23.52 GiB)
  ❌ ComfyUI 自動判断で部分lowvram運用も追いつかない

戦略:
  --reserve-vram 2.0 = ComfyUI に「最低2GB常時確保」を指示
  → 積極的にUNETレイヤをCPU退避するようになる
  → --lowvram より速い (-5〜10%、--lowvramは-25%)
  → fp8 + sage の効果と組み合わせて最速 OOM 回避
"""
import os, sys, re

MAIN_PY = '/comfyui/main.py'

if not os.path.exists(MAIN_PY):
    print(f'[PATCH ERROR] {MAIN_PY} not found')
    sys.exit(1)

with open(MAIN_PY, 'r') as f:
    content = f.read()

PATCH_HEADER = """# === [v9.5 PATCH] reserve-vram strategy ===
import sys as _sys_v95

# v9.1の名残 --highvram を確実に除去
while '--highvram' in _sys_v95.argv:
    _sys_v95.argv.remove('--highvram')
while '--lowvram' in _sys_v95.argv:
    _sys_v95.argv.remove('--lowvram')

# 注入する引数:
#   --fast fp16_accumulation : 4090 fp16 高速化 (検証済)
#   --reserve-vram 2.0       : 常時2GB空き確保→積極CPUオフロード
#   --cache-classic          : メモリプール最適化、断片化抑制
_args_v95 = ['--fast', 'fp16_accumulation', '--reserve-vram', '2.0', '--cache-classic']
for _arg in reversed(_args_v95):
    if _arg not in _sys_v95.argv:
        _sys_v95.argv.insert(1, _arg)
print(f'[v9.5 PATCH] argv = {_sys_v95.argv}')
# === [v9.5 PATCH] end ===

"""

# 旧パッチ除去
content = re.sub(
    r'# === \[v9\.\d PATCH\][^\n]*\n.*?# === \[v9\.\d PATCH\] end ===\n+',
    '', content, flags=re.DOTALL
)

if 'v9.5 PATCH' in content:
    print('[PATCH] main.py already patched, skip')
else:
    with open(MAIN_PY, 'w') as f:
        f.write(PATCH_HEADER + content)
    print('[PATCH] main.py PATCHED with v9.5 (--fast fp16_accumulation --reserve-vram 2.0 --cache-classic)')
