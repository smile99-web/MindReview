import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // VPS 只有 2GB 内存，next build 自带的 tsc 类型检查会 OOM 压垮整机。
  // 类型检查改在本地执行：npx tsc --noEmit（deploy 前必须跑）。
  typescript: {
    ignoreBuildErrors: true,
  },
  // 跨平台 prisma binary target：让 Mac build 同时产出 darwin + linux engine，
  // VPS（debian-openssl-3.0.x）才能跑。配合 prisma/schema.prisma 的 binaryTargets。
};

export default nextConfig;
