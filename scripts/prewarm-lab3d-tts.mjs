#!/usr/bin/env node
/**
 * prewarm-lab3d-tts.mjs — 在 VPS 上为 3D 实验室预生成全部 TTS 讲解音频
 *
 * 原理：从 .env 读 JWT_SECRET_KEY，为管理员（ADMIN_USERNAMES 第一个）现场
 * 签发一个短期 access token，然后调用本机的 /rm/api/lab3d/prewarm（路由内部
 * 逐个场景逐条步骤调用豆包 TTS 并写入 AudioAsset 共享缓存，幂等可重跑）。
 *
 * 用法（在 /opt/mindreview 下）：
 *   node scripts/prewarm-lab3d-tts.mjs [sceneId]
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';

const sceneId = process.argv[2];
const env = fs.readFileSync('.env', 'utf8');
const secret = (env.match(/^JWT_SECRET_KEY=(.+)$/m) || [])[1]?.trim();
const adminName = (env.match(/^ADMIN_USERNAMES=(.+)$/m) || [])[1]?.split(',')[0]?.trim() || 'cmx';
if (!secret) {
  console.error('JWT_SECRET_KEY not found in .env');
  process.exit(1);
}

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

const prisma = new PrismaClient();
const user = await prisma.user.findUnique({ where: { username: adminName } });
if (!user) {
  console.error(`admin user ${adminName} not found`);
  process.exit(1);
}
await prisma.$disconnect();

const header = b64({ alg: 'HS256', typ: 'JWT' });
const payload = b64({
  sub: user.id,
  username: user.username,
  exp: Math.floor(Date.now() / 1000) + 3600,
  type: 'access',
});
const signature = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
const token = `${header}.${payload}.${signature}`;

const url = `http://127.0.0.1:3000/rm/api/lab3d/prewarm${sceneId ? `?only=${sceneId}` : ''}`;
console.log(`Prewarming TTS via ${url} ...`);
const res = await fetch(url, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
});
const data = await res.json();
console.log(`HTTP ${res.status}`);
console.log(JSON.stringify(data, null, 2));
