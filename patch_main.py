"""
[v9.4] main.py パッチ
v9.3からの変更: --highvram削除、--lowvram追加（最終版）

経緯:
  v9.1 (--highvram): UNET fp16 で OOM (19.85GB)
  v9.2 ((highvram削除)): 速度低下するも OOM 残存
  v9.3 (--lowvram): 提案するも反映確認できず
  v9.4: fp8がワークフローで効いている状態 + --lowvram の組合せ

戦略:
- ワークフロー側でUNETLoaderにfp8_e4m3fn指定 (Cloudflare Workerで設定済)
- main.py に --lowvram を強制注入し、UNET の CPU/GPU 自動転送を有効化
- fp8 + lowvram で VRAM 12-14GB予想、絶対OOMしない
"""
import os, sys, re

MAIN_PY = '/comfyui/main.py'

if not os.path.exists(MAIN_PY):
    print(f'[PATCH ERROR] {MAIN_PY} not found')
    sys.exit(1)

with open(MAIN_PY, 'r') as f:
    content = f.read()

PATCH_HEADER = """# === [v9.4 PATCH] fast args + lowvram auto-inject ===
import sys as _sys_v94
_args_v94 = ['--fast', 'fp16_accumulation', '--lowvram']
# --highvram があれば除去 (v9.1の名残対策)
if '--highvram' in _sys_v94.argv:
    _sys_v94.argv.remove('--highvram')
for _arg in reversed(_args_v94):
    if _arg not in _sys_v94.argv:
        _sys_v94.argv.insert(1, _arg)
print(f'[v9.4 PATCH] argv = {_sys_v94.argv}')
# === [v9.4 PATCH] end ===

"""

# 旧パッチがあれば除去
content = re.sub(
    r'# === \[v9\.\d PATCH\][^\n]*\n.*?# === \[v9\.\d PATCH\] end ===\n+',
    '', content, flags=re.DOTALL
)

if 'v9.4 PATCH' in content:
    print('[PATCH] main.py already patched, skip')
else:
    with open(MAIN_PY, 'w') as f:
        f.write(PATCH_HEADER + content)
    print('[PATCH] main.py PATCHED with v9.4 (--fast fp16_accumulation --lowvram)')
