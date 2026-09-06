/**
 * 字幕文件（srt / vtt）解析与 Transcript 归一化。
 *
 * yt-dlp 下载的字幕以 srt/vtt 为主。归一化做三件事：
 * 1. 过滤空文本、修复时间倒挂；
 * 2. 合并相邻文本相同的 cue（滚动字幕的重复残留）；
 * 3. 轻量聚句：前段未以终止标点收尾且时间间隔很短时合并成一句，
 *    保证 segments 是「句级」粒度，供摘要分块与字幕面板使用。
 *    B 站 AI 字幕普遍没有标点，聚句带句长（80 字）与时长（30 秒）
 *    上限，避免无标点字幕被串成整段。
 */

export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

const TIMESTAMP_PATTERN =
  /^(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})/;

const CJK_CHAR = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/;

export function parseSubtitleFile(content: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let current: { start: number; end: number; lines: string[] } | null = null;

  for (const rawLine of content.split(/\r?\n/)) {
    const timestamp = rawLine.match(TIMESTAMP_PATTERN);
    if (timestamp) {
      if (current?.lines.length) {
        segments.push(toSegment(current));
      }
      current = {
        start: toSeconds(timestamp[1], timestamp[2], timestamp[3], timestamp[4]),
        end: toSeconds(timestamp[5], timestamp[6], timestamp[7], timestamp[8]),
        lines: [],
      };
      continue;
    }

    if (!current) continue;
    const text = stripMarkup(rawLine);
    if (text) {
      current.lines.push(text);
      continue;
    }
    if (current.lines.length) {
      segments.push(toSegment(current));
      current = null;
    }
  }
  if (current?.lines.length) {
    segments.push(toSegment(current));
  }

  return segments;
}

export function normalizeSegments(raw: TranscriptSegment[]): TranscriptSegment[] {
  const cleaned = raw
    .map((segment) => ({ ...segment, text: segment.text.replace(/\s+/g, ' ').trim() }))
    .filter((segment) => segment.text && segment.end > segment.start);

  const result: TranscriptSegment[] = [];
  for (const segment of cleaned) {
    const previous = result[result.length - 1];
    if (!previous) {
      result.push(segment);
      continue;
    }

    // 时间重叠：裁剪到上一段结束之后
    if (segment.start < previous.end) {
      segment.start = previous.end;
      if (segment.end <= segment.start) continue;
    }

    // 滚动字幕残留：相邻文本完全相同则延长上一段
    if (previous.text === segment.text) {
      previous.end = segment.end;
      continue;
    }

    // 轻量聚句：上一句还没说完、间隔很短，且合并后不超句长/时长上限时并入。
    // B 站 AI 字幕普遍没有标点，句长与时长上限是防止无标点字幕串成整段的保险。
    const gap = segment.start - previous.end;
    const mergedChars = previous.text.length + segment.text.length;
    const mergedSpan = segment.end - previous.start;
    if (
      gap <= MERGE_GAP_SECONDS &&
      !isSentenceEnd(previous.text) &&
      mergedChars <= MAX_MERGED_SENTENCE_CHARS &&
      mergedSpan <= MAX_SEGMENT_SPAN_SECONDS
    ) {
      previous.text = joinText(previous.text, segment.text);
      previous.end = segment.end;
      continue;
    }

    result.push(segment);
  }

  return result;
}

const MERGE_GAP_SECONDS = 0.8;
const MAX_MERGED_SENTENCE_CHARS = 80;
const MAX_SEGMENT_SPAN_SECONDS = 30;

function toSegment(cue: { start: number; end: number; lines: string[] }): TranscriptSegment {
  return {
    start: cue.start,
    end: cue.end,
    text: joinText('', ...cue.lines).trim(),
  };
}

function toSeconds(h: string, m: string, s: string, ms: string): number {
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, '0')) / 1000;
}

function stripMarkup(line: string): string {
  return line
    .replace(/^\uFEFF/, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

/**
 * 按时间窗 / 字数把 segments 切成摘要分块（块边界落在句边界上）。
 * 默认约 8-10 分钟或 4000 字先到为准，60 分钟视频约切 5-6 块。
 */
export function chunkTranscriptByWindow(
  segments: TranscriptSegment[],
  maxChars = 4000,
  maxSpanSeconds = 600,
): TranscriptChunk[] {
  const chunks: TranscriptChunk[] = [];
  let current: { startTime: number; endTime: number; lines: string[] } | null = null;

  for (const segment of segments) {
    if (
      current &&
      (current.lines.join('').length + segment.text.length > maxChars ||
        segment.end - current.startTime > maxSpanSeconds)
    ) {
      chunks.push(toChunk(current));
      current = null;
    }
    if (!current) {
      current = { startTime: segment.start, endTime: segment.end, lines: [segment.text] };
      continue;
    }
    current.lines.push(segment.text);
    current.endTime = segment.end;
  }
  if (current) chunks.push(toChunk(current));

  return chunks;
}

export type TranscriptChunk = {
  startTime: number;
  endTime: number;
  text: string;
};

function toChunk(cue: {
  startTime: number;
  endTime: number;
  lines: string[];
}): TranscriptChunk {
  return {
    startTime: cue.startTime,
    endTime: cue.endTime,
    text: joinText('', ...cue.lines),
  };
}

/** `mm:ss`；超过 99 分钟时分钟位自然扩到三位 */
export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

/** Transcript 转 prompt 文本：`[mm:ss] 文本` 每行一句 */
export function formatTranscriptForPrompt(segments: TranscriptSegment[]): string {
  return segments.map((segment) => `[${formatTimestamp(segment.start)}] ${segment.text}`).join('\n');
}

const ANCHOR_PATTERN = /\[(\d{1,3}):(\d{2})\]/g;
const ANCHOR_TOLERANCE_SECONDS = 2;

/**
 * 校验总结里的 `[mm:ss]` 锚点：能匹配到字幕时间（容差 ±2s）的吸附到真实
 * 时间；匹配不到的直接移除，防止 LLM 编造的时间点污染播放跳转。
 */
export function normalizeAnchors(markdown: string, segments: TranscriptSegment[]): string {
  if (!segments.length) return markdown;

  const starts = segments.map((segment) => segment.start).sort((a, b) => a - b);
  return markdown.replace(ANCHOR_PATTERN, (match, mm: string, ss: string) => {
    const seconds = Number(mm) * 60 + Number(ss);
    const nearest = findNearest(starts, seconds);
    if (nearest === null || Math.abs(nearest - seconds) > ANCHOR_TOLERANCE_SECONDS) {
      return '';
    }
    return `[${formatTimestamp(nearest)}]`;
  });
}

function findNearest(sorted: number[], target: number): number | null {
  if (!sorted.length) return null;
  let low = 0;
  let high = sorted.length - 1;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (sorted[mid] <= target) low = mid;
    else high = mid;
  }
  const left = sorted[low];
  const right = sorted[high];
  return Math.abs(left - target) <= Math.abs(right - target) ? left : right;
}

function isSentenceEnd(text: string): boolean {
  return /[。！？!?…；;~」』”）)]$/.test(text);
}

/** 中文相邻不加空格，拉丁词间保留空格 */
function joinText(...parts: string[]): string {
  let out = '';
  for (const part of parts) {
    if (!part) continue;
    if (!out) {
      out = part;
      continue;
    }
    out += CJK_CHAR.test(out[out.length - 1]) || CJK_CHAR.test(part[0]) ? part : ` ${part}`;
  }
  return out;
}
