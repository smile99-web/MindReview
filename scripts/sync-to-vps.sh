#!/usr/bin/env bash
#
# sync-to-vps.sh — 将本地 MindReview 代码同步到 VPS 并重新部署
#
# 用法: bash scripts/sync-to-vps.sh
# 同步后自动在 VPS 上：装依赖 → prisma migrate → 内存限制构建 → 复制静态文件 → pm2 reload
#
# 注意：VPS 只有 2GB 内存，裸跑 npm run build 曾两次 OOM 压垮整机（需控制台
# 硬重启），必须用 systemd-run 内存限制构建（见下）。

set -euo pipefail

VPS_HOST="14.103.219.117"
VPS_USER="root"
VPS_PATH="/opt/mindreview"
SSH_KEY="$HOME/.ssh/id_ed25519_14.103.219.117"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no"

SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "📦 同步代码到 VPS..."

rsync -avz --delete \
  -e "ssh $SSH_OPTS" \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.git' \
  --exclude='.DS_Store' \
  --exclude='*.log' \
  --exclude='.env' \
  --exclude='data' \
  --exclude='BUG-AUDIT-*.md' \
  --exclude='mindreview_dump.sql' \
  --exclude='public/uploads' \
  "$SRC_DIR/" \
  "$VPS_USER@$VPS_HOST:$VPS_PATH/"

echo ""
echo "📚 VPS 上安装依赖 + 应用数据库迁移..."
# rsync 不同步 node_modules，依赖有变化必须先 install；
# migrate deploy 让新 migration（如索引变更）随部署自动应用
ssh $SSH_OPTS "$VPS_USER@$VPS_HOST" "cd $VPS_PATH && npm install && npx prisma generate && npx prisma migrate deploy"

echo ""
echo "🔨 VPS 上重新构建（systemd-run 内存限制，防 OOM）..."
ssh $SSH_OPTS "$VPS_USER@$VPS_HOST" "systemd-run --unit=mr-build --collect --wait -p MemoryMax=1400M -p MemorySwapMax=3400M -p Nice=19 --working-directory=$VPS_PATH /usr/bin/env NODE_OPTIONS=--max-old-space-size=1024 /usr/bin/npm run build"

echo ""
echo "📋 复制静态文件到 standalone..."
# VPS 构建产出的是根布局 .next/standalone/server.js（已实测确认），
# static/public 就拷到 standalone 根下
ssh $SSH_OPTS "$VPS_USER@$VPS_HOST" "cd $VPS_PATH && cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/"

echo ""
echo "🔄 重启 PM2 进程..."
ssh $SSH_OPTS "$VPS_USER@$VPS_HOST" "pm2 reload mindreview"

echo ""
echo "✅ 部署完成 — http://$VPS_HOST/rm"
