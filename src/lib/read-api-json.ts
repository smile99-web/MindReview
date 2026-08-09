/**
 * nginx 超时/限体时返回 HTML 错误页，res.json() 抛的是浏览器原始解析错误
 * （用户看不懂）——换成带状态码的可操作提示。
 * 所有调用服务端 API 的页面都应使用本函数，而不是裸 res.json()。
 */
export async function readApiJson<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    throw new Error(`服务器响应异常 (${res.status})，请稍后重试`);
  }
}
