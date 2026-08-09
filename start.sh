#!/usr/bin/env bash
# start.sh — PM2 启动入口
# standalone 里 server.js 的位置取决于构建机器的目录名：
#   Mac  (/Users/ai/MindReview)   → .next/standalone/MindReview/server.js
#   VPS  (/opt/mindreview)        → .next/standalone/server.js（已实测为根布局）
#   部分 Next 版本               → .next/standalone/<项目目录名>/server.js
# 动态查找，三端通用。多种布局共存时（不同部署脚本先后留下的残留）
# 必须选 mtime 最新的那个——find -print -quit 取 readdir 顺序的第一个，
# 可能 exec 到旧构建且无任何报错。
set -a
source /opt/mindreview/.env
set +a

SERVER_JS="$(find /opt/mindreview/.next/standalone -maxdepth 3 -name server.js -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -n 1 | cut -d' ' -f2-)"
if [ -z "$SERVER_JS" ]; then
  echo "start.sh: server.js not found under .next/standalone" >&2
  exit 1
fi
echo "start.sh: launching $SERVER_JS" >&2
exec node "$SERVER_JS"
