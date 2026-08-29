/**
 * 截断长文本供提示词或上下文使用，超长时追加截断标记。
 */
export function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}\n\n[内容已截断]` : value;
}
