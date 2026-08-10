#!/usr/bin/env node
/**
 * invite-codes.mjs — 推荐码管理（注册必须填写有效推荐码）
 *
 * 用法（在 /opt/mindreview 下）：
 *   node scripts/invite-codes.mjs list                                # 列出全部推荐码
 *   node scripts/invite-codes.mjs create [CODE] [--max N] [--note 备注]
 *     # CODE 省略时自动生成 8 位随机码；--max 省略或为 0 = 不限使用次数
 *   node scripts/invite-codes.mjs delete CODE                         # 删除推荐码
 */
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--max') flags.max = parseInt(argv[++i], 10);
    else if (argv[i] === '--note') flags.note = argv[++i];
  }
  return flags;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  if (cmd === 'list') {
    const codes = await prisma.inviteCode.findMany({ orderBy: { createdAt: 'asc' } });
    if (codes.length === 0) {
      console.log('（还没有推荐码，用 create 创建一个）');
      return;
    }
    for (const c of codes) {
      const uses = c.maxUses > 0 ? `${c.usedCount}/${c.maxUses}` : `${c.usedCount}/∞`;
      console.log(`${c.code}  已用 ${uses}  ${c.note ?? ''}  (${c.createdAt.toISOString().slice(0, 10)})`);
    }
    return;
  }

  if (cmd === 'create') {
    const flags = parseFlags(rest);
    const code = (rest[0] && !rest[0].startsWith('--') ? rest[0] : null)
      ?? crypto.randomBytes(4).toString('hex').toUpperCase();
    const maxUses = Number.isInteger(flags.max) && flags.max > 0 ? flags.max : 0;
    const created = await prisma.inviteCode.create({
      data: { code, maxUses, note: flags.note ?? null },
    });
    console.log(`已创建推荐码: ${created.code}  (次数: ${maxUses > 0 ? maxUses : '不限'}${created.note ? `, 备注: ${created.note}` : ''})`);
    return;
  }

  if (cmd === 'delete') {
    const code = rest[0];
    if (!code) {
      console.error('用法: node scripts/invite-codes.mjs delete CODE');
      process.exit(1);
    }
    await prisma.inviteCode.delete({ where: { code } });
    console.log(`已删除推荐码: ${code}`);
    return;
  }

  console.error(`未知命令: ${cmd ?? '(空)'}\n用法: node scripts/invite-codes.mjs list | create [CODE] [--max N] [--note 备注] | delete CODE`);
  process.exit(1);
}

main()
  .catch((e) => {
    if (e?.code === 'P2002') console.error('推荐码已存在');
    else if (e?.code === 'P2025') console.error('推荐码不存在');
    else console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
