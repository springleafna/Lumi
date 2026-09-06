/**
 * 截断长文本供提示词或上下文使用，超长时追加截断标记。
 */
export function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}\n\n[内容已截断]` : value;
}

/**
 * 统计文本字数：CJK 按字符计，拉丁字母与数字按词计（与 @lumi/parser 口径一致）。
 */
export function countTextWords(text: string): number {
  const normalized = text.replace(/\s+/g, ' ');
  const latinWords = normalized.match(/[A-Za-z0-9]+/g)?.length ?? 0;
  const cjkChars = normalized.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  return latinWords + cjkChars;
}
