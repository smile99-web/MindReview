import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveUserIdFromRequest } from "@/lib/user-context";

/**
 * 管理员权限校验：用于全局 AI 配置相关路由（ApiKey 表是全站共享的，没有 userId）。
 *
 * 通过环境变量 ADMIN_USERNAMES 配置管理员用户名列表（逗号分隔，自动 trim）。
 *
 * 警告：未配置 ADMIN_USERNAMES 时，为不破坏现有单用户部署会放行所有登录用户。
 * 生产环境必须配置该变量，否则任意登录用户都能读写删全站 AI 配置。
 *
 * 返回 null 表示校验通过；返回 NextResponse(403) 表示拒绝。
 */
export async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
  // 先做登录校验（防御纵深），再检查管理员名单。
  // 未认证时返回 401 而不是让异常冒泡：调用方都是通用 try/catch，
  // 抛出去会变成 500（前端只对 401 触发重新登录流程）
  let userId: string;
  try {
    userId = await resolveUserIdFromRequest(req);
  } catch {
    return NextResponse.json({ error: "未登录或登录已过期" }, { status: 401 });
  }

  const adminUsernames = (process.env.ADMIN_USERNAMES || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  // 生产环境未配置管理员名单时 fail-closed：与 server-auth 对 JWT_SECRET_KEY
  // 的处理一致。否则任意登录用户都能改写全局 AI 配置（含 baseUrl 劫持 key 外泄）。
  // 开发环境仍放行，避免破坏本地单人调试。
  if (adminUsernames.length === 0) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "服务未配置管理员名单（ADMIN_USERNAMES），拒绝执行管理操作" },
        { status: 403 },
      );
    }
    return null;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !adminUsernames.includes(user.username)) {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }

  return null;
}
