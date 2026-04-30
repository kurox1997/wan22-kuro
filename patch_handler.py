"""
[v9.6] worker-comfyui の handler.py に gifs キーサポートを追加するパッチ

問題: worker-comfyui v5.8.5 は VHS_VideoCombine の 'gifs' キーを無視する
症状: ログに "WARNING: Node X produced unhandled output keys: ['gifs']" が出る
解決: handler.py の "images" 処理に "gifs" も並列処理を追加
"""
import os, re, sys, glob

# worker-comfyui の handler.py を探す
# 'unhandled output keys' という文字列を含むファイルを特定
def find_handler():
    candidates = []
    for root in ['/', '/usr/local', '/opt', '/app']:
        try:
            for p in glob.glob(f'{root}/**/handler.py', recursive=True):
                try:
                    with open(p, 'r') as f:
                        c = f.read()
                    if 'unhandled output keys' in c:
                        candidates.append(p)
                except Exception:
                    pass
        except Exception:
            pass
    return candidates

handlers = find_handler()
print(f'[PATCH-HANDLER] Found handler.py: {handlers}')

if not handlers:
    print('[PATCH-HANDLER] WARNING: No handler.py with "unhandled output keys" found')
    print('[PATCH-HANDLER] Searching for any handler.py...')
    for p in glob.glob('/**/handler.py', recursive=True):
        print(f'[PATCH-HANDLER]   candidate: {p}')
    sys.exit(0)

for path in handlers:
    with open(path, 'r') as f:
        content = f.read()

    if 'v9.6 GIFS PATCH' in content:
        print(f'[PATCH-HANDLER] {path} already patched, skip')
        continue

    print(f'[PATCH-HANDLER] Patching: {path}')
    original = content

    # パッチ戦略：
    # 1. SUPPORTED_OUTPUT_KEYS や類似の定数があれば、そこに 'gifs' 追加
    # 2. node_output["images"] や .get("images", []) のような取得箇所を gifs も拾うように
    # 3. for image in node_output["images"]: 形式のループ周りを拡張

    # 戦略A: 'images' リストへの gifs フォールバック追加
    # 例: for image in node_output["images"]:
    #     ↓
    #     for image in (node_output.get("images", []) + node_output.get("gifs", [])):
    pattern1 = r'for\s+(\w+)\s+in\s+(\w+)\[\s*["\']images["\']\s*\]'
    content = re.sub(
        pattern1,
        r'for \1 in (\2.get("images", []) + \2.get("gifs", []))',
        content
    )

    # 戦略B: list = node_output["images"] 形式
    pattern2 = r'(\w+)\s*=\s*(\w+)\[\s*["\']images["\']\s*\](?!\s*\.\w)'
    content = re.sub(
        pattern2,
        r'\1 = (\2.get("images", []) + \2.get("gifs", []))',
        content
    )

    # 戦略C: if "images" in node_output: の判定を緩める
    pattern3 = r'if\s+["\']images["\']\s+in\s+(\w+)\s*:'
    content = re.sub(
        pattern3,
        r'if "images" in \1 or "gifs" in \1:',
        content
    )

    # 戦略D: get("images", []) 形式
    pattern4 = r'(\w+)\.get\(\s*["\']images["\']\s*,\s*\[\]\s*\)'
    content = re.sub(
        pattern4,
        r'(\1.get("images", []) + \1.get("gifs", []))',
        content
    )

    # マーカー追加
    if content != original:
        content = '# v9.6 GIFS PATCH applied\n' + content
        with open(path, 'w') as f:
            f.write(content)
        print(f'[PATCH-HANDLER] {path} PATCHED successfully')

        # 変更箇所をdiff風に表示
        for i, (a, b) in enumerate(zip(original.split('\n'), content.split('\n'))):
            if a != b and i < 200:
                print(f'  Line {i}: {a[:80]}')
                print(f'        → {b[:80]}')
    else:
        print(f'[PATCH-HANDLER] {path} no patterns matched, dumping context...')
        # 'images' を含む行を表示してデバッグ補助
        for i, line in enumerate(content.split('\n')):
            if 'images' in line and 'def ' not in line:
                print(f'  Line {i}: {line[:100]}')
                if i > 50:
                    break
