/**
 * 将字符串安全解析为 Date，无效或为空时返回 null。
 *
 * 用于处理来源不可信的日期字符串（例如抓取到的文章发布时间），
 * 避免 `new Date(invalid)` 产生的 Invalid Date 流入数据库。
 */
export function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
