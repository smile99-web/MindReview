// ---------------------------------------------------------------------------
// postbuild：把 Next standalone 运行所需、但构建不自动复制的资源补进
// .next/standalone —— 服务器上直接 `npm run build` 后必须做这步，否则：
//   1. .next/static 没进 standalone → 全站 JS/CSS chunk 404，页面白屏
//   2. pdf-parse 的 pdf.worker.mjs 没被 nft 追踪 → PDF 上传 500
// 幂等：重复执行安全。
// ---------------------------------------------------------------------------
import { cpSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const standalone = join(root, '.next', 'standalone');

if (!existsSync(join(standalone, 'server.js'))) {
  console.log('[postbuild] 未发现 standalone 构建产物，跳过资源同步');
  process.exit(0);
}

// 1. 静态资源（合并拷贝，不再先清：部署瞬间用户浏览器里可能还缓存着上一版
//    HTML，它引用的旧 hash chunk 一旦被删，页面就只剩无样式 HTML（白屏）。
//    保留旧 chunk 让旧 HTML 在缓存期内继续可用；>14 天的老 chunk 定期清理
//    防堆积——hash 文件名不会冲突，同名文件内容必然相同。
import { readdirSync, statSync, unlinkSync } from 'node:fs';
const staticSrc = join(root, '.next', 'static');
const staticDest = join(standalone, '.next', 'static');
const PRUNE_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function pruneOldFiles(dir) {
  if (!existsSync(dir)) return 0;
  let pruned = 0;
  const cutoff = Date.now() - PRUNE_AGE_MS;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      pruned += pruneOldFiles(full);
    } else if (statSync(full).mtimeMs < cutoff) {
      unlinkSync(full);
      pruned += 1;
    }
  }
  return pruned;
}

if (existsSync(staticSrc)) {
  cpSync(staticSrc, staticDest, { recursive: true });
  const pruned = pruneOldFiles(staticDest);
  console.log(`[postbuild] .next/static → standalone/.next/static ✓（合并模式，清理 >14天旧 chunk ${pruned} 个）`);
}

// 2. public 目录
const publicSrc = join(root, 'public');
if (existsSync(publicSrc)) {
  cpSync(publicSrc, join(standalone, 'public'), { recursive: true });
  console.log('[postbuild] public → standalone/public ✓');
}

// 3. pdf-parse (pdfjs-dist) worker —— chunk 里按相对路径 import 它
const workerSrc = join(root, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.mjs');
const workerDest = join(standalone, '.next', 'server', 'chunks', 'pdf.worker.mjs');
if (existsSync(workerSrc) && existsSync(join(standalone, '.next', 'server', 'chunks'))) {
  copyFileSync(workerSrc, workerDest);
  console.log('[postbuild] pdf.worker.mjs → standalone/.next/server/chunks ✓');
}
