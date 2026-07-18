export function getErrorMessage(error: unknown, fallback = "Internal server error"): string {
  if (error instanceof Error && error.message) {
    // Prisma 错误（PrismaClientKnownRequestError/ValidationError 等）的 message
    // 含 SQL 片段、表名、字段名、内部文件路径等实现细节，原样返回给客户端
    // 会泄露 schema 信息 → 统一打码。服务端日志仍可通过 console.error 拿原文。
    // 应用主动 throw 的业务错误（如 'AI 返回内容不是 JSON'）不受影响。
    if (error.name.startsWith('PrismaClient')) {
      return '数据库操作失败';
    }
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return fallback;
}

/**
 * 根据错误推断响应状态码：认证失败应返回 401 而非 500，
 * 客户端才能据此触发 token 刷新/重新登录流程。
 */
export function getErrorStatus(error: unknown, fallback = 500): number {
  if (error instanceof Error && error.message === 'Authentication required') {
    return 401;
  }
  return fallback;
}
