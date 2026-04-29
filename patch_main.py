"""
[v9.2] main.py に fast args を強制注入するパッチ
v9.1からの変更: --highvram を削除 (24GB 4090でOOM回避)
ComfyUI 自動メモリ管理に任せる方針
"""
import os, sys

MAIN_PY = '/comfyui/main.py'

if not os.path.exists(MAIN_PY):
    print(f'[PATCH ERROR] {MAIN_PY} not found')
    sys.exit(1)

with open(MAIN_PY, 'r') as f:
    content = f.read()

# v9.2: --highvram を削除 (OOM対策)
PATCH_HEADER = """# === [v9.2 PATCH] fast args auto-inject (no --highvram) ===
import sys as _sys_v92
_args_v92 = ['--fast', 'fp16_accumulation']
for _arg in reversed(_args_v92):
    if _arg not in _sys_v92.argv:
        _sys_v92.argv.insert(1, _arg)
print(f'[v9.2 PATCH] argv = {_sys_v92.argv}')
# === [v9.2 PATCH] end ===

"""

# 旧バージョンのパッチが入っていたら除去 (再ビルド時の重複防止)
import re
content = re.sub(r'# === \[v9\.\d PATCH\][^\n]*\n.*?# === \[v9\.\d PATCH\] end ===\n+', '', content, flags=re.DOTALL)

if 'v9.2 PATCH' in content:
    print('[PATCH] main.py already patched, skip')
else:
    with open(MAIN_PY, 'w') as f:
        f.write(PATCH_HEADER + content)
    print('[PATCH] main.py PATCHED with v9.2 (no --highvram, no --use-sage-attention)')
