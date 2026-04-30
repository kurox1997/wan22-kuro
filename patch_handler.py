"""
[v9.6.1] worker-comfyui handler.py に gifs キーサポート追加（高速版）

v9.6 反省: glob.glob('/**/handler.py', recursive=True) が遅すぎて
           Docker全体スキャンで何時間もかかる問題を発生させた

v9.6.1: subprocess で find コマンド使用 + 探索範囲を限定
"""
import os, re, sys, subprocess

print('[PATCH-HANDLER] Starting handler.py search (fast mode)...')

# find コマンドで高速探索 (タイムアウト30秒)
# /proc /sys /dev /tmp は除外、シンボリックリンク追跡しない
search_dirs = ['/handler.py', '/src/handler.py', '/app/handler.py', '/worker/handler.py']

found = []
for path in search_dirs:
    if os.path.isfile(path):
        try:
            with open(path, 'r') as f:
                if 'unhandled output keys' in f.read():
                    found.append(path)
        except Exception:
            pass

# 直接当たらなかった場合、find で範囲限定探索
if not found:
    print('[PATCH-HANDLER] Not in known paths, searching with find...')
    try:
        # /opt /app /usr/local /home に限定、シンボリックリンク追跡なし
        result = subprocess.run(
            ['find', '/opt', '/app', '/usr/local', '/home',
             '-maxdepth', '6',
             '-name', 'handler.py',
             '-type', 'f',
             '-not', '-path', '*/__pycache__/*'],
            capture_output=True, text=True, timeout=30
        )
        for path in result.stdout.strip().split('\n'):
            if not path:
                continue
            try:
                with open(path, 'r') as f:
                    content = f.read()
                if 'unhandled output keys' in content or 'send_post' in content:
                    found.append(path)
            except Exception:
                pass
    except subprocess.TimeoutExpired:
        print('[PATCH-HANDLER] find timeout, skipping')
    except Exception as e:
        print(f'[PATCH-HANDLER] find error: {e}')

print(f'[PATCH-HANDLER] Found: {found}')

if not found:
    print('[PATCH-HANDLER] WARNING: handler.py not found, build will continue without patch')
    print('[PATCH-HANDLER] Listing top-level directories for debug:')
    for d in ['/', '/opt', '/app', '/src']:
        if os.path.isdir(d):
            try:
                entries = os.listdir(d)[:20]
                print(f'  {d}: {entries}')
            except Exception:
                pass
    sys.exit(0)

# パッチ適用
for path in found:
    with open(path, 'r') as f:
        content = f.read()

    if 'v9.6 GIFS PATCH' in content:
        print(f'[PATCH-HANDLER] {path} already patched, skip')
        continue

    print(f'[PATCH-HANDLER] Patching {path} ({len(content)} bytes)')
    original = content

    # 'images' キー処理を 'gifs' にも拡張
    # パターンA: for image in node_output["images"]:
    content = re.sub(
        r'for\s+(\w+)\s+in\s+(\w+)\[\s*["\']images["\']\s*\]',
        r'for \1 in (\2.get("images", []) + \2.get("gifs", []))',
        content
    )
    # パターンB: get("images", [])
    content = re.sub(
        r'(\w+)\.get\(\s*["\']images["\']\s*,\s*\[\]\s*\)',
        r'(\1.get("images", []) + \1.get("gifs", []))',
        content
    )
    # パターンC: if "images" in node_output:
    content = re.sub(
        r'if\s+["\']images["\']\s+in\s+(\w+)\s*:',
        r'if "images" in \1 or "gifs" in \1:',
        content
    )

    if content != original:
        content = '# v9.6 GIFS PATCH applied\n' + content
        with open(path, 'w') as f:
            f.write(content)
        print(f'[PATCH-HANDLER] {path} PATCHED OK')
    else:
        print(f'[PATCH-HANDLER] {path} no patterns matched')
        # デバッグ用: images を含む最初の数行を表示
        for i, line in enumerate(content.split('\n')[:300]):
            if 'images' in line and 'def ' not in line and '#' not in line[:5]:
                print(f'  L{i}: {line[:120]}')

print('[PATCH-HANDLER] Done')
