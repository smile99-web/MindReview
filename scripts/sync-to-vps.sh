#!/usr/bin/env bash
#
# sync-to-vps.sh — 将本地 MindReview 代码同步到 VPS 并重新部署
#
# 用法: bash scripts/sync-to-vps.sh
# 同步后自动在 VPS 上 build + 复制静态文件 + pm2 reload

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
  --exclude='mindreview_dump.sql' \
  "$SRC_DIR/" \
  "$VPS_USER@$VPS_HOST:$VPS_PATH/"

echo ""
echo "🔨 VPS 上重新构建..."
ssh $SSH_OPTS "$VPS_USER@$VPS_HOST" "cd $VPS_PATH && npm run build 2>&1"

echo ""
echo "📋 复制静态文件到 standalone..."
ssh $SSH_OPTS "$VPS_USER@$VPS_HOST" "cp -r $VPS_PATH/.next/static $VPS_PATH/.next/standalone/.next/static"

echo ""
echo "🔄 重启 PM2 进程..."
ssh $SSH_OPTS "$VPS_USER@$VPS_HOST" "pm2 reload mindreview"

echo ""
echo "✅ 部署完成 — http://$VPS_HOST"
