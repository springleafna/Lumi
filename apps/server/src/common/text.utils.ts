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

/** Embedding 单次请求的批量上限：条数与总字符数先到为准 */
const EMBEDDING_BATCH_MAX_TEXTS = 16;
const EMBEDDING_BATCH_MAX_CHARS = 6000;

/**
 * 把待向量化的文本切成多个请求批次。
 * 供应商对单次 embeddings 调用有条数 / 总 token 限制，超限会返回异常
 * 响应（如 {"data":null}），因此长文档的几十个分块必须分批发送。
 */
export function splitEmbeddingBatches(
  texts: string[],
  maxTexts = EMBEDDING_BATCH_MAX_TEXTS,
  maxChars = EMBEDDING_BATCH_MAX_CHARS,
): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let currentChars = 0;

  for (const text of texts) {
    const itemChars = Math.max(1, text.length);
    if (
      current.length > 0 &&
      (current.length >= maxTexts || currentChars + itemChars > maxChars)
    ) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(text);
    currentChars += itemChars;
  }
  if (current.length > 0) batches.push(current);

  return batches;
}
