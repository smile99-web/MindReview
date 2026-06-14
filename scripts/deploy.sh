#!/usr/bin/env bash
#
# deploy.sh — MindReview 本地构建 + VPS 部署 + Git 推送（macOS / Linux）
#
# 等价于 scripts\deploy.bat。两端要保持行为一致时改这里 + 同步改 .bat。
#
# 用法:   bash scripts/deploy.sh
# 前置:   ssh 密钥能直连 VPS（默认 ~/.ssh/id_ed25519_14.103.219.117），
#         本仓库 working tree 干净或已 git add。
#
# 流程:
#   1) npx next build        本地构建（产出 .next/standalone）
#   2) tar | ssh VPS         上传 standalone/static/public/prisma/package.json
#      远端: untar + cp static/public → standalone/ + prisma generate + pm2 restart
#   3) git add + commit      有变更才提交，提示输入 commit message
#   4) git push origin main  推 GitHub

set -euo pipefail

# ---------- 配置 ----------
SERVER="root@14.103.219.117"
REMOTE_DIR="/opt/mindreview"
BRANCH="main"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_14.103.219.117}"

SSH_OPTS=()
if [[ -f "$SSH_KEY" ]]; then
    SSH_OPTS+=( -i "$SSH_KEY" )
fi
SSH_OPTS+=( -o StrictHostKeyChecking=accept-new -o BatchMode=yes )

# ---------- 1. 本地构建 ----------
echo "============================================"
echo "  MindReview - Build + Deploy + Push"
echo "============================================"
echo
echo "[1/4] Building Next.js..."
npx next build
echo "      Build OK"
echo

# ---------- 2. 上传 VPS 并重启 ----------
echo "[2/4] Deploying to VPS..."
# 彻底清空 VPS 端 build 目录（保留顶层 server.js / package.json / .env / public）
# 上一次的 bug 是只删了 .next/static，没删 .next/standalone/.next 嵌套路径的旧 chunks，
# 留下 36 个孤儿 client chunk 覆盖不到。这次把整个 MindReview/.next 都清掉让 tar 重建。
ssh "${SSH_OPTS[@]}" "$SERVER" "cd '$REMOTE_DIR' && \
      rm -rf .next/standalone/MindReview/.next \
             .next/standalone/.next \
             2>/dev/null; \
      echo '      (cleaned old build artifacts)'"
tar --exclude='node_modules' \
    --exclude='.git' \
    --exclude='id_ed25519*' \
    --exclude='.DS_Store' \
    -czf - .next/standalone .next/static public prisma package.json \
  | ssh "${SSH_OPTS[@]}" "$SERVER" "cd '$REMOTE_DIR' && tar -xzf - && \
        cp -r .next/static .next/standalone/MindReview/.next/static && \
        cp -r public .next/standalone/ && \
        npx prisma generate 2>/dev/null && \
        npx prisma migrate deploy 2>&1; \
        pm2 restart mindreview"
echo "      VPS deploy OK"
echo

# ---------- 3. Git 提交 ----------
echo "[3/4] Committing to git..."
git add -A
if git diff --cached --quiet; then
    echo "      Nothing to commit"
else
    # 交互式 TTY 才问；非 TTY 用 $DEPLOY_COMMIT_MSG 或默认消息
    if [[ -t 0 && -z "${DEPLOY_COMMIT_MSG:-}" ]]; then
        read -r -p "      Enter commit message (or press Enter for default): " COMMIT_MSG
        COMMIT_MSG="${COMMIT_MSG:-Update: code changes}"
    else
        COMMIT_MSG="${DEPLOY_COMMIT_MSG:-chore: post-deploy code changes}"
    fi
    git commit -m "$COMMIT_MSG"
    echo "      Committed"
fi
echo

# ---------- 4. 推 GitHub ----------
echo "[4/4] Pushing to GitHub..."
git push origin "$BRANCH"
echo "      Push OK"
echo

echo "============================================"
echo "  Done - http://14.103.219.117"
echo "  Repo - https://github.com/smile99-web/MindReview"
echo "============================================"
