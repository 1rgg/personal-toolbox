#!/usr/bin/env python3
"""在无法使用 git 协议（github.com:443 的 TLS 被中断）时，用 GitHub Git Data API 推送本地目录。

用法：
    GH_TOKEN=<personal access token> \
    python3 deploy/git-push-api.py 1rgg/personal-toolbox . "提交说明"

可选环境变量：
    GIT_PUSH_AUTHOR_NAME / GIT_PUSH_AUTHOR_EMAIL   提交身份，默认取 git config
    GIT_PUSH_CACHE                                  blob 缓存的路径，重复推送时省去重传

实现要点：
1. 全新的空仓库不允许直接写 Git Data（创建 blob 会返回 409 "Git Repository is empty"），
   所以先用 Contents API 落一个种子提交；
2. blob 按内容长度做缓存，重复推送只上传变化的文件；
3. 最后用 PATCH 强制移动 refs/heads/main 到新提交。
"""
import base64
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

API = 'https://api.github.com'


def main():
    token = os.environ.get('GH_TOKEN')
    if not token:
        sys.exit('缺少 GH_TOKEN 环境变量')
    if len(sys.argv) < 3:
        sys.exit('用法: GH_TOKEN=xxx python3 deploy/git-push-api.py <owner/repo> <目录> [提交说明]')
    owner, name = sys.argv[1].split('/')
    root = os.path.abspath(sys.argv[2])
    message = sys.argv[3] if len(sys.argv) > 3 else 'chore: 同步站点代码'
    cache_path = os.environ.get('GIT_PUSH_CACHE', os.path.join(root, '.git-push-cache.json'))

    def call(method, path, payload=None):
        url = API + path
        data = json.dumps(payload).encode('utf-8') if payload is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header('Authorization', 'token ' + token)
        req.add_header('Accept', 'application/vnd.github+json')
        if data:
            req.add_header('Content-Type', 'application/json')
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except urllib.error.HTTPError as err:
            sys.exit('%s %s -> %s: %s' % (method, url, err.code, err.read().decode('utf-8', 'replace')))

    def parent_commit():
        try:
            branches = call('GET', f'/repos/{owner}/{name}/branches')
        except SystemExit:
            raise
        except urllib.error.HTTPError as err:
            if err.code != 409:
                raise
            branches = []
        for branch in branches:
            if branch['name'] == 'main':
                return branch['commit']['sha']
        seed = call('PUT', f'/repos/{owner}/{name}/contents/README.md', {
            'message': 'chore: 初始化仓库',
            'content': base64.b64encode('初始化\n'.encode('utf-8')).decode('ascii'),
            'branch': 'main',
        })
        return seed['commit']['sha']

    def ident():
        def conf(key, fallback):
            out = subprocess.run(['git', 'config', key], capture_output=True, text=True)
            return out.stdout.strip() or fallback
        return {
            'name': os.environ.get('GIT_PUSH_AUTHOR_NAME') or conf('user.name', 'github-actions'),
            'email': os.environ.get('GIT_PUSH_AUTHOR_EMAIL') or conf('user.email', 'noreply@github.com'),
        }

    parent = parent_commit()

    cache = {}
    if os.path.exists(cache_path):
        try:
            cache = json.load(open(cache_path, encoding='utf-8'))
        except Exception:
            cache = {}

    entries = []
    for base, dirs, names in os.walk(root):
        dirs[:] = [d for d in dirs if d not in ('.git', 'node_modules', '.cache')]
        for filename in names:
            full = os.path.join(base, filename)
            rel = os.path.relpath(full, root).replace(os.sep, '/')
            if rel == '.git-push-cache.json':
                continue
            raw = open(full, 'rb').read()
            key = '%s:%d' % (rel, len(raw))
            sha = cache.get(key)
            if not sha:
                sha = call('POST', f'/repos/{owner}/{name}/git/blobs', {
                    'content': base64.b64encode(raw).decode('ascii'),
                    'encoding': 'base64',
                })['sha']
                cache[key] = sha
                json.dump(cache, open(cache_path, 'w', encoding='utf-8'))
            entries.append({'path': rel, 'mode': '100644', 'type': 'blob', 'sha': sha})

    tree = call('POST', f'/repos/{owner}/{name}/git/trees', {'tree': entries})['sha']
    commit = call('POST', f'/repos/{owner}/{name}/git/commits', {
        'message': message, 'tree': tree, 'parents': [parent],
        'author': ident(), 'committer': ident(),
    })['sha']
    call('PATCH', f'/repos/{owner}/{name}/git/refs/heads/main', {'sha': commit, 'force': True})
    print('pushed %s (%d files) -> %s/%s' % (commit[:8], len(entries), owner, name))


if __name__ == '__main__':
    main()