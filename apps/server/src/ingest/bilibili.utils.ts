import { BadRequestException } from '@nestjs/common';

/**
 * B 站视频链接的识别、展开与规范化。
 *
 * 视频导入的判重键是「BV 号 + 分 P」：同一个视频存在 b23.tv 短链、
 * 带 ?p= 参数、av 号等多种 URL 形态，导入时统一展开 / 提取后写回
 * 规范化链接（canonical URL），再复用文章管线的三态判重。
 */

const BILIBILI_VIDEO_HOSTS = new Set(['www.bilibili.com', 'm.bilibili.com']);
const BILIBILI_SHORT_HOST = 'b23.tv';
const VIDEO_PATH_PATTERN = /^\/video\/(BV[0-9A-Za-z]{8,12}|av\d+)$/;
const SHORT_LINK_TIMEOUT_MS = 5000;

const SHORT_LINK_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

export type BilibiliVideoRef = {
  /** BV 号（大小写敏感）或 av 号，如 BV1hM8X6kEso / av170001 */
  videoId: string;
  /** 分 P，从 1 开始；URL 未带 p 参数时为 1 */
  page: number;
};

export function isBilibiliShortLink(rawUrl: string): boolean {
  try {
    return new URL(rawUrl).hostname.toLowerCase() === BILIBILI_SHORT_HOST;
  } catch {
    return false;
  }
}

/**
 * 识别 B 站视频链接；短链（b23.tv）需要先展开再识别，
 * 非视频页 / 非 B 站链接返回 null（走文章管线）。
 */
export function detectBilibiliVideo(rawUrl: string): BilibiliVideoRef | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!['https:', 'http:'].includes(url.protocol)) return null;
  if (!BILIBILI_VIDEO_HOSTS.has(url.hostname.toLowerCase())) return null;

  const match = url.pathname.match(VIDEO_PATH_PATTERN);
  if (!match) return null;

  return {
    videoId: match[1],
    page: parsePageParam(url.searchParams.get('p')),
  };
}

export function canonicalBilibiliVideoUrl(ref: BilibiliVideoRef): string {
  const base = `https://www.bilibili.com/video/${ref.videoId}`;
  return ref.page > 1 ? `${base}?p=${ref.page}` : base;
}

/**
 * 展开短链到最终地址。失效短链 / 网络失败按导入错误抛出。
 */
export async function expandBilibiliShortLink(rawUrl: string): Promise<string> {
  try {
    const response = await fetch(rawUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(SHORT_LINK_TIMEOUT_MS),
      headers: { 'user-agent': SHORT_LINK_UA },
    });
    return response.url || rawUrl;
  } catch {
    throw new BadRequestException('B站短链无法解析，请检查链接是否有效');
  }
}

function parsePageParam(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}
