import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // 跨平台 prisma binary target：让 Mac build 同时产出 darwin + linux engine，
  // VPS（debian-openssl-3.0.x）才能跑。配合 prisma/schema.prisma 的 binaryTargets。
};

export default nextConfig;
