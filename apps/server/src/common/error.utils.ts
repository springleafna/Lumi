/**
 * 从未知错误中提取可读的错误信息。
 *
 * 后端各模块统一使用此函数，避免在业务文件里重复定义相同实现。
 * 仅覆盖最常见的 `Error.message` 场景；需要特殊处理（例如解析 NestJS
 * 异常响应对象）的调用方应保留各自的局部实现。
 */

export const TRANSACTION_TIMEOUT_MESSAGE =
  '数据库事务超时，请稍后重试；若持续出现，请检查到数据库的网络延迟';

/** Prisma 事务超时（P2028）：常见于高延迟数据库链路（如本地开发连远程库）。 */
export function isTransactionTimeout(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P2028';
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (isTransactionTimeout(error)) return TRANSACTION_TIMEOUT_MESSAGE;
    return error.message;
  }
  return '未知错误';
}
