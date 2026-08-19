/**
 * 存量 KnowledgeNode 的 embedding 回填脚本。
 * 背景：2026-08 启用 pgvector 语义搜索后，926 个存量节点 embedding 全为 NULL
 * （历史上向量只写不读，从未回填）。本脚本按 5 路并发逐节点调用
 * generateAndSaveEmbedding（标题+摘要 → doubao-embedding → 写库）。
 *
 * 用法（服务器 /opt/mindreview 下）：npx tsx scripts/backfill-embedding.ts
 * 幂等：只处理 embedding IS NULL 的节点，中断重跑安全。
 */
import { prisma } from '../src/lib/prisma';
import { generateAndSaveEmbedding } from '../src/lib/embedding';

const CONCURRENCY = 5;
const BATCH_DELAY_MS = 300;
// --force：重新生成全部节点（用于向量生成逻辑修复后覆盖旧的兜底向量）
const FORCE = process.argv.includes('--force');

async function main() {
  const rows = FORCE
    ? await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM "KnowledgeNode" ORDER BY "createdAt" ASC`,
      )
    : await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM "KnowledgeNode" WHERE embedding IS NULL ORDER BY "createdAt" ASC`,
      );
  const total = rows.length;
  console.log(`[backfill] ${total} nodes to process (force=${FORCE})`);

  let done = 0;
  let skipped = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((row) => generateAndSaveEmbedding(row.id)),
    );
    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (r.value === true) done += 1;
        else skipped += 1; // API 不可用（429/超时）：跳过不写兜底向量
      } else {
        failed += 1;
      }
    }
    if ((i / CONCURRENCY) % 10 === 0) {
      console.log(`[backfill] progress ${Math.min(i + CONCURRENCY, rows.length)}/${total} (saved=${done}, skipped=${skipped}, failed=${failed})`);
    }
    await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
  }
  console.log(`[backfill] finished: saved=${done}, skipped=${skipped}, failed=${failed}, total=${total}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('[backfill] fatal:', e);
  await prisma.$disconnect();
  process.exit(1);
});
