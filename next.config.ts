import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // 应用挂在 http://14.103.219.117/rm 子路径下（同机还有 lijie 等应用）。
  // next/link、next/navigation 会自动加前缀；fetch 的 '/api/...' 路径
  // 不会自动加，统一在 src/lib/auth.ts 的 authFetch/AUTH_API 里收口。
  basePath: '/rm',
  // VPS 只有 2GB 内存，next build 自带的 tsc 类型检查会 OOM 压垮整机。
  // 类型检查改在本地执行：npx tsc --noEmit（deploy 前必须跑）。
  typescript: {
    ignoreBuildErrors: true,
  },
  // 跨平台 prisma binary target：让 Mac build 同时产出 darwin + linux engine，
  // VPS（debian-openssl-3.0.x）才能跑。配合 prisma/schema.prisma 的 binaryTargets。
};

export default nextConfig;
