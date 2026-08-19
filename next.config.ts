import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // 每次部署变化此 ID：Next 会让持有旧部署资源（HTML/chunk hash 不匹配）
  // 的客户端自动放弃 SPA 导航、整页重载拿到新 HTML——配合部署时保留旧
  // chunk（postbuild 合并模式），双保险杜绝"缓存旧 HTML 引用已删 chunk"
  // 造成的白屏。改日期戳即可强制全网客户端刷新。
  deploymentId: process.env.NEXT_DEPLOYMENT_ID || 'd20260818a',
  // 应用挂在 http://14.103.219.117/rm 子路径下（同机还有 lijie 等应用）。
  // next/link、next/navigation 会自动加前缀；fetch 的 '/api/...' 路径
  // 不会自动加，统一在 src/lib/auth.ts 的 authFetch/AUTH_API 里收口。
  basePath: '/rm',
  // 类型检查不再跳过：2026-08 全量 bug 修复后 `npx tsc --noEmit` 已零错误通过。
  // 此前 ignoreBuildErrors:true 让 TS1016 这类编译错误直接进入生产
  // （learning-path.ts 的参数顺序错误就因此潜伏），build 必须卡类型关。
  typescript: {
    ignoreBuildErrors: false,
  },
  // 跨平台 prisma binary target：让 Mac build 同时产出 darwin + linux engine，
  // VPS（debian-openssl-3.0.x）才能跑。配合 prisma/schema.prisma 的 binaryTargets。
};

export default nextConfig;
