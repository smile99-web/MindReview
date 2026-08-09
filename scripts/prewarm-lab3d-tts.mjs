#!/usr/bin/env node
/**
 * prewarm-lab3d-tts.mjs — 在 VPS 上为 3D 实验室预生成全部 TTS 讲解音频
 *
 * 原理：从 .env 读 JWT_SECRET_KEY，为管理员（ADMIN_USERNAMES 第一个）现场
 * 签发一个短期 access token，然后逐场景调用本机 /rm/api/lab3d/prewarm?only=<id>
 * （路由内部调用豆包 TTS 并写入 AudioAsset 共享缓存，幂等可重跑）。
 * 逐场景调用而不是一次全量：全量约 250 条生成耗时 5~10 分钟，会撞 fetch 的
 * headersTimeout（300s）；单场景每次只生成 ≤5 条，秒级返回。
 *
 * 注意：SCENE_IDS 与 src/lib/lab3d/registry.ts 的 SCENES 同步维护；
 * 路由对未知 id 只会在 failed 里记一笔，不会产生副作用。
 *
 * 用法（在 /opt/mindreview 下）：
 *   node scripts/prewarm-lab3d-tts.mjs            # 全部场景
 *   node scripts/prewarm-lab3d-tts.mjs phys-lens  # 单个场景
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';

const SCENE_IDS = [
  // 数学
  'math-number-line', 'math-equation-balance', 'math-solids', 'math-angles',
  'math-parallel', 'math-coordinate', 'math-equation-system', 'math-triangle',
  'math-congruence', 'math-symmetry', 'math-parallelogram', 'math-pythagoras',
  'math-functions-jhs', 'math-statistics', 'math-quadratic-function',
  'math-function-transform', 'math-rotation', 'math-circle', 'math-probability',
  'math-similarity', 'math-trig', 'math-three-views',
  // 物理
  'phys-motion', 'phys-speed-graph', 'phys-sound', 'phys-states', 'phys-light',
  'phys-lens', 'phys-density', 'phys-force', 'phys-newton', 'phys-pressure',
  'phys-liquid-pressure', 'phys-buoyancy', 'phys-work', 'phys-energy',
  'phys-lever', 'phys-pulley', 'phys-heat', 'phys-engine', 'phys-circuit',
  'phys-circuit-parallel', 'phys-resistance', 'phys-magnet', 'phys-motor',
  'phys-home-circuit', 'phys-projectile',
  // 化学
  'chem-lab', 'chem-air', 'chem-oxygen', 'chem-molecule', 'chem-atom',
  'chem-diffusion', 'chem-periodic', 'chem-electrolysis', 'chem-equation',
  'chem-carbon', 'chem-combustion', 'chem-metal', 'chem-solution', 'chem-nacl',
  'chem-acid-base',
];

const onlyArg = process.argv[2];
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

const ids = onlyArg ? [onlyArg] : SCENE_IDS;
let generated = 0;
let cached = 0;
const failed = [];

for (const id of ids) {
  const url = `http://127.0.0.1:3000/rm/api/lab3d/prewarm?only=${id}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(120_000),
    });
    const data = await res.json();
    if (!res.ok) {
      failed.push({ id, error: `HTTP ${res.status}: ${JSON.stringify(data)}` });
      console.log(`${id}: HTTP ${res.status}`);
      continue;
    }
    generated += data.generated ?? 0;
    cached += data.cached ?? 0;
    if (data.failedCount > 0) failed.push(...data.failed.map((f) => ({ id, ...f })));
    console.log(`${id}: +${data.generated} generated, ${data.cached} cached, ${data.failedCount} failed`);
  } catch (e) {
    failed.push({ id, error: String(e) });
    console.log(`${id}: fetch error ${String(e)}`);
  }
}

console.log('\n==== SUMMARY ====');
console.log(`scenes: ${ids.length}, generated: ${generated}, cached: ${cached}, failed: ${failed.length}`);
if (failed.length) console.log(JSON.stringify(failed, null, 2));
