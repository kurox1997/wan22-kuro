"""
[v9.6] main.py argv パッチ（v9.5から継続）
"""
import os, sys, re

MAIN_PY = '/comfyui/main.py'

if not os.path.exists(MAIN_PY):
    print(f'[PATCH ERROR] {MAIN_PY} not found')
    sys.exit(1)

with open(MAIN_PY, 'r') as f:
    content = f.read()

PATCH_HEADER = """# === [v9.6 PATCH] argv inject ===
import sys as _sys_v96
while '--highvram' in _sys_v96.argv:
    _sys_v96.argv.remove('--highvram')
while '--lowvram' in _sys_v96.argv:
    _sys_v96.argv.remove('--lowvram')
_args_v96 = ['--fast', 'fp16_accumulation', '--reserve-vram', '2.0', '--cache-classic']
for _arg in reversed(_args_v96):
    if _arg not in _sys_v96.argv:
        _sys_v96.argv.insert(1, _arg)
print(f'[v9.6 PATCH] argv = {_sys_v96.argv}')
# === [v9.6 PATCH] end ===

"""

content = re.sub(
    r'# === \[v9\.\d PATCH\][^\n]*\n.*?# === \[v9\.\d PATCH\] end ===\n+',
    '', content, flags=re.DOTALL
)

if 'v9.6 PATCH' in content:
    print('[PATCH] main.py already patched, skip')
else:
    with open(MAIN_PY, 'w') as f:
        f.write(PATCH_HEADER + content)
    print('[PATCH] main.py PATCHED with v9.6')
