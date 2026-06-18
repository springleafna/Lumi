/**
 * 从未知错误中提取可读的错误信息。
 *
 * 后端各模块统一使用此函数，避免在业务文件里重复定义相同实现。
 * 仅覆盖最常见的 `Error.message` 场景；需要特殊处理（例如解析 NestJS
 * 异常响应对象）的调用方应保留各自的局部实现。
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return '未知错误';
}
