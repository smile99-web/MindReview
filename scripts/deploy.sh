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
# 彻底清空 VPS 端 build 产物目录（保留 server.js / .env / public / package.json / prisma）
# 必须在 tar 推送前清，tar 默认不删目标已存在的文件，会留下孤儿 chunks。
# - .next/standalone/MindReview/.next  → PM2 实际加载的 build
# - .next/standalone/.next            → 旧 deploy 用错 cp 路径的残留
# - .next/static                      → 多次 tar 推送累积的客户端 chunks 源
# 推送方式：scp 上传 tar 到 VPS 临时文件，再 VPS 端 tar -xzf。
# 之前用 `tar | ssh tar -xzf -` 通过 SSH stdin pipe 推送 44MB tar.gz 在某个位置截断，
# 导致 MindReview/.next/node_modules/（包含 prisma symlink）解压缺失，运行时找不到。
TMP_TAR="/tmp/mindreview-deploy-$$.tar.gz"
trap 'rm -f "$TMP_TAR"' EXIT
tar --exclude='.git' \
    --exclude='id_ed25519*' \
    --exclude='.DS_Store' \
    -czf "$TMP_TAR" .next/standalone .next/static public prisma package.json ecosystem.config.js
echo "      tar size: $(du -h "$TMP_TAR" | awk '{print $1}'), files: $(tar -tzf "$TMP_TAR" | wc -l | tr -d ' ')"
scp "${SSH_OPTS[@]}" "$TMP_TAR" "$SERVER:/tmp/mindreview-deploy.tar.gz"
# 远程命令整体加 set -e + 把 pm2 那两行也接进 && 链；
# 任何一步失败立即退出（之前的写法用 ; 隔开 pm2，tar 失败但 pm2 仍跑，
# 导致 deploy 报 "OK" 实际是旧版本 + CSS/chunks 404）。
ssh "${SSH_OPTS[@]}" "$SERVER" "set -e && cd '$REMOTE_DIR' && \
      # 清理上次部署残留。注意：必须把 node_modules 也清掉！
      # Mac build 产物里 .next/standalone/MindReview/node_modules/{next,react,react-dom}
      # 是 pnpm symlink，tar 解压到同名 symlink 上会因为 'File exists' 退出，
      # 整条 && 链断开后 pm2 仍会被拉起（用 ; 分隔），导致 CSS/chunks 全部 404。
      rm -rf .next/standalone/MindReview/.next \
             .next/standalone/MindReview/node_modules \
             .next/standalone/.next \
             .next/static; \
      # Prisma client 二进制硬编码了 Mac 上的 build 路径 /Users/ai/MindReview
      # （outputFileTracingRoot 不能在 projectPath 外）。在 VPS 上创建 symlink
      # 让 prisma 找到对应 node_modules。
      mkdir -p /Users && \
      ln -sfn /opt/mindreview /Users/ai && \
      tar -xzf /tmp/mindreview-deploy.tar.gz && \
      rm -f /tmp/mindreview-deploy.tar.gz && \
      # 确保 standalone 的 .next/ 父目录存在（tar 解压偶发会缺这一层，
      # 缺了 cp 会因 No such file or directory 直接退出 — 见 2026-06-14 首页 CSS 404 事件）
      mkdir -p .next/standalone/MindReview/.next && \
      cp -r .next/static .next/standalone/MindReview/.next/static && \
      echo \"   [vps] static chunks: \$(ls .next/standalone/MindReview/.next/static/chunks 2>/dev/null | wc -l)\" && \
      cp -r public .next/standalone/ && \
      # 把 @prisma/client 复制到符号链接指向的位置
      # （Mac build 产物里 client-2d8ce578843d5dc0 是一个 symlink → MindReview/node_modules/@prisma/client）
      mkdir -p .next/standalone/MindReview/node_modules/@prisma && \
      rm -rf .next/standalone/MindReview/node_modules/@prisma/client && \
      cp -r node_modules/@prisma/client .next/standalone/MindReview/node_modules/@prisma/ && \
      npx prisma migrate deploy 2>&1 && \
      (pm2 delete mindreview 2>/dev/null || true) && \
      pm2 start ecosystem.config.js --update-env 2>&1"
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
