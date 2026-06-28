#!/usr/bin/env bash
set -a
source /opt/mindreview/.env
set +a
exec node /opt/mindreview/.next/standalone/MindReview/server.js
