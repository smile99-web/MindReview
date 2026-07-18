#!/usr/bin/env bash
# start.sh — PM2 启动入口
# standalone 里 server.js 的位置取决于构建机器的目录名：
#   Mac  (/Users/ai/MindReview)   → .next/standalone/MindReview/server.js
#   VPS  (/opt/mindreview)        → .next/standalone/mindreview/server.js
#   部分 Next 版本               → .next/standalone/server.js
# 动态查找，三端通用。
set -a
source /opt/mindreview/.env
set +a

SERVER_JS="$(find /opt/mindreview/.next/standalone -maxdepth 3 -name server.js -print -quit)"
if [ -z "$SERVER_JS" ]; then
  echo "start.sh: server.js not found under .next/standalone" >&2
  exit 1
fi
exec node "$SERVER_JS"
