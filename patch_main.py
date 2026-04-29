"""
[v9.1] main.py に sage args を強制注入するパッチ
heredoc を Dockerfile で使わずに済ませるため、独立スクリプトとして分離
"""
import os, sys

MAIN_PY = '/comfyui/main.py'

if not os.path.exists(MAIN_PY):
    print(f'[PATCH ERROR] {MAIN_PY} not found')
    sys.exit(1)

with open(MAIN_PY, 'r') as f:
    content = f.read()

PATCH_HEADER = """# === [v9.1 PATCH] fast args auto-inject ===
import sys as _sys_v91
_args_v91 = ['--fast', 'fp16_accumulation', '--highvram']
for _arg in reversed(_args_v91):
    if _arg not in _sys_v91.argv:
        _sys_v91.argv.insert(1, _arg)
print(f'[v9.1 PATCH] argv = {_sys_v91.argv}')
# === [v9.1 PATCH] end ===

"""

if 'v9.1 PATCH' in content:
    print('[PATCH] main.py already patched, skip')
else:
    with open(MAIN_PY, 'w') as f:
        f.write(PATCH_HEADER + content)
    print('[PATCH] main.py PATCHED with v9.1 (no --use-sage-attention)')
