#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PokeEngmon — 一鍵 git add / commit / push

用法（喺 repo 內任何位置執行）：
  python tools/git_commit_push.py -m "feat: add new picture words"
  python tools/git_commit_push.py -m "fix: typo in quiz feedback"
  python tools/git_commit_push.py                         # 自動產生 chore(vNN): update N files
  python tools/git_commit_push.py --dry-run               # 只印出會做咩，唔會真做
  python tools/git_commit_push.py --paths Q_folder js/app.js
  python tools/git_commit_push.py --skip-push             # 只 commit，唔 push
  python tools/git_commit_push.py -m "..." --body "詳細解釋"

設計原則：
  - 只用 git CLI，唔靠第三方套件
  - 全部輸出 UTF-8，避免 Windows PowerShell 中文亂碼
  - 唔會 interactive、唔會 force push、唔會 skip hook
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys

# ---------- 安全檢查：呢啲檔案唔准入 commit ----------
BLOCKED_NAMES = {"supabase-config.local.js", ".env", ".env.local", "id_rsa"}
BLOCKED_SUFFIXES = (".pem", ".key", ".p12", ".pfx")

# ---------- 狀態碼中文說明 ----------
CODE_LABEL = {
    "??": "untracked",
    "!!": "ignored",
    "M": "modified",
    "MM": "modified",
    "A": "added",
    "AM": "added",
    "D": "deleted",
    "R": "renamed",
    "C": "copied",
}
CONFLICT_CODES = {"UU", "AA", "DD", "AU", "UA", "DU", "UD"}


def log(msg=""):
    print(msg)


def err(msg=""):
    print(msg, file=sys.stderr)


def die(msg, code=1):
    err(f"✖ {msg}")
    sys.exit(code)


def git(args, cwd=None, stdin=None):
    """執行 git，回傳 CompletedProcess（唔會拋 exception）。"""
    try:
        return subprocess.run(
            ["git", *args],
            cwd=cwd,
            input=stdin,
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
        )
    except FileNotFoundError:
        die("搵唔到 git，請先安裝 Git 並加至 PATH。", 2)


def git_ok(args, cwd=None, stdin=None):
    r = git(args, cwd=cwd, stdin=stdin)
    if r.returncode != 0:
        detail = (r.stderr or r.stdout).strip()
        die(f"git {' '.join(args)} 失敗：\n{detail}")
    return r


def find_root(explicit=None):
    if explicit:
        return os.path.abspath(explicit)
    r = git(["rev-parse", "--show-toplevel"])
    if r.returncode != 0 or not r.stdout.strip():
        die("搵唔到 git repo，請喺 PokeEngmon 資料夾內執行，或用 --repo 指定路徑。", 2)
    return r.stdout.strip()


def read_status(root):
    """回傳 [(XY, path), ...]，用 -z 避免檔名有空格／中文時解析錯。"""
    r = git_ok(["status", "--porcelain=v1", "-z"], cwd=root)
    parts = r.stdout.split("\0")
    items = []
    i = 0
    while i < len(parts):
        p = parts[i]
        i += 1
        if not p:
            continue
        code, path = p[:2], p[3:]
        items.append((code, path))
        # rename / copy 會多一個來源路徑
        if "R" in code or "C" in code:
            i += 1
    return items


def label_of(code):
    if code in CODE_LABEL:
        return CODE_LABEL[code]
    if code.strip() == "M":
        return "modified"
    if code[0] == "M" or code[1] == "M":
        return "modified"
    if code[0] == "A" or code[1] == "A":
        return "added"
    if code[0] == "D" or code[1] == "D":
        return "deleted"
    return code.strip() or "other"


def describe_status(items, limit=10):
    """印出精簡摘要（唔會因為 1000 個檔案刷屏）。"""
    if not items:
        return
    counts = {}
    for code, _ in items:
        counts[label_of(code)] = counts.get(label_of(code), 0) + 1
    log("  變更摘要：")
    for name, n in sorted(counts.items(), key=lambda kv: -kv[1]):
        log(f"    {name:<10} {n}")
    log(f"  檔案（最多列 {limit} 個）：")
    for code, path in items[:limit]:
        log(f"    {code} {path}")
    if len(items) > limit:
        log(f"    … 仲有 {len(items) - limit} 個檔案")


def check_secrets(items):
    """阻擋明顯嘅密鑰檔（.gitignore 已擋一部分，呢度做第二重防線）。"""
    bad = []
    for _, path in items:
        base = os.path.basename(path).lower()
        if base in BLOCKED_NAMES or base.endswith(BLOCKED_SUFFIXES):
            bad.append(path)
    if bad:
        err("✖ 以下檔案疑似含密鑰／本機設定，已中止：")
        for p in bad:
            err(f"    {p}")
        err("  真係要 commit 就自己手動 git add（腳本唔會幫你做）。")
        sys.exit(2)


def app_version(root):
    """讀 js/app.js 嘅 APP_VERSION，用嚟砌自動 commit message。"""
    path = os.path.join(root, "js", "app.js")
    try:
        with open(path, encoding="utf-8") as f:
            m = re.search(r'APP_VERSION\s*=\s*"([^"]+)"', f.read())
        return m.group(1) if m else None
    except OSError:
        return None


def ensure_identity(root):
    for key in ("user.name", "user.email"):
        if not git(["config", key], cwd=root).stdout.strip():
            die(
                f'未設定 git {key}。先執行：\n'
                f'  git config --global {key} "你嘅名"\n'
                f'  git config --global user.email "你@email.com"',
                2,
            )


def main():
    ap = argparse.ArgumentParser(
        description="PokeEngmon 一鍵 git add / commit / push",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="例子：python tools/git_commit_push.py -m \"v117: add picture words\"",
    )
    ap.add_argument("-m", "--message", help="commit 標題（無 prefix 時會自動加 vNN:）")
    ap.add_argument("--body", help="commit 內文（另起一段）")
    ap.add_argument("--paths", nargs="+", help="只 stage 呢啲路徑（預設 stage 全部變更）")
    ap.add_argument("--branch", help="指定分支（預設目前分支）")
    ap.add_argument("--repo", help="repo 根目錄（預設自動偵測）")
    ap.add_argument("--skip-push", action="store_true", help="只 commit，唔 push")
    ap.add_argument("--dry-run", action="store_true", help="只顯示會執行嘅指令")
    args = ap.parse_args()

    root = find_root(args.repo)
    os.chdir(root)

    branch = args.branch or git_ok(["rev-parse", "--abbrev-ref", "HEAD"], cwd=root).stdout.strip()
    if branch == "HEAD":
        die("目前係 detached HEAD 狀態，請先 git checkout main。", 2)
    if branch != "main":
        log(f"⚠ 注意：目前分支係 {branch}，但網站係由 main 部署（push 其他分支唔會上線）。")

    log(f"→ repo:   {root}")
    log(f"→ branch: {branch}")

    # ---------- 1. 檢查變更 ----------
    items = read_status(root)
    if not items:
        log("✔ 工作區乾淨，冇嘢要 commit。")
        return 0
    describe_status(items)
    check_secrets(items)

    conflicts = [p for code, p in items if code in CONFLICT_CODES]
    if conflicts:
        err("✖ 有未解決嘅 merge conflict，請先處理：")
        for p in conflicts:
            err(f"    {p}")
        return 2

    # ---------- 2. Stage ----------
    if args.paths:
        for p in args.paths:
            # 檔案可能存在（新增／修改）或者已被 git 追蹤（刪除）
            known = os.path.exists(p) or git(["ls-files", "--error-unmatch", p], cwd=root).returncode == 0
            if not known:
                die(f"路徑唔存在：{p}", 2)
        stage_cmd = ["add", "--", *args.paths]
    else:
        stage_cmd = ["add", "-A"]

    if args.dry_run:
        log(f"[dry-run] git {' '.join(stage_cmd)}")
        # dry-run 唔會真 stage，用現有變更清單估算將會提交嘅檔案
        staged = list(args.paths) if args.paths else [p for _, p in items]
    else:
        git_ok(stage_cmd, cwd=root)
        staged = [p for p in git_ok(["diff", "--cached", "--name-only", "-z"], cwd=root).stdout.split("\0") if p]

    if not staged:
        log("✔ 冇新增／修改嘅內容需要 commit。")
        return 0
    log(f"→ 將提交 {len(staged)} 個檔案")

    # ---------- 3. Commit message ----------
    version = app_version(root) or "v?"
    if args.message:
        subject = args.message.strip()
        # 唔再加 prefix 嘅情況（semantic-release 要讀到開頭 type）：
        #   Conventional Commits: feat: / fix(scope): / chore!: …
        #   舊式: fix(v117): / v117:
        # 其他（純中文／無 type）先 prepend APP_VERSION:
        already_typed = re.match(
            r"^(?:"
            r"(?:build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)"
            r"(?:\([^)]*\))?(!)?:\s"
            r"|v\d+:"
            r"|[a-z]+\([^)]*\):"
            r")",
            subject,
            re.I,
        )
        if not already_typed:
            subject = f"{version}: {subject}"
    else:
        subject = f"chore({version}): update {len(staged)} file(s)"
    message = subject if not args.body else f"{subject}\n\n{args.body.strip()}"

    ensure_identity(root)

    if args.dry_run:
        log(f'[dry-run] git commit -F -  <<< "{message}"')
        if not args.skip_push:
            log(f"[dry-run] git push  ({branch})")
        return 0

    # ---------- 4. Commit（用 stdin 餵訊息，避免中文／引號問題）----------
    r = git(["commit", "-F", "-"], cwd=root, stdin=message)
    if r.returncode != 0:
        die(f"commit 失敗：\n{(r.stderr or r.stdout).strip()}")

    short = git_ok(["log", "-1", "--oneline"], cwd=root).stdout.strip()
    log(f"✔ 已 commit：{short}")

    # ---------- 5. Push ----------
    if args.skip_push:
        log("ℹ 已跳過 push（--skip-push）。記得之後要 push，否則線上唔會更新。")
        return 0

    upstream = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], cwd=root)
    if upstream.returncode == 0:
        push_args = ["push"]
        target = upstream.stdout.strip()
    else:
        push_args = ["push", "-u", "origin", branch]
        target = f"origin/{branch}"

    r = git(push_args, cwd=root)
    if r.returncode != 0:
        detail = (r.stderr or r.stdout).strip()
        err(f"✖ push 失敗：\n{detail}")
        low = detail.lower()
        if "non-fast-forward" in low or "rejected" in low or "fetch first" in low:
            err("  遠端有新 commit，先同步再 push：")
            err(f"    git pull --rebase origin {branch}")
            err("    python tools/git_commit_push.py")
        elif "authentication" in low or "permission" in low or "403" in low:
            err("  認證問題：檢查 GitHub 帳戶／Personal Access Token／SSH key。")
        elif "could not resolve host" in low or "timed out" in low:
            err("  網絡問題：檢查連線或 proxy 設定。")
        return 1

    log(f"✔ 已 push 到 {target}")

    # ---------- 6. 收尾驗證 ----------
    left = read_status(root)
    if left:
        log(f"ℹ 工作區仲有 {len(left)} 個未提交變更（未 stage 或係新檔案）。")
    else:
        log("✔ 工作區乾淨。")
    log("ℹ GitHub Pages 需要幾十秒重新部署；用戶下次開頁面會自動更新。")
    return 0


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    sys.exit(main())
