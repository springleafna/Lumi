import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';

const BILIBILI_NAV_API = 'https://api.bilibili.com/x/web-interface/nav';
const LOGIN_PROBE_TIMEOUT_MS = 8_000;

const REQUEST_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/**
 * B 站 Cookie 管理：读取 cookies.txt（Netscape 格式）并在视频解析前
 * 主动探测登录态。
 *
 * Cookie 过期不会让 yt-dlp 报错——接口只是把请求当成未登录，
 * 返回空字幕列表，与「视频本身没字幕」无法区分。因此这里在解析前
 * 用 nav 接口探测一次：确认未登录时直接快速失败并提示替换 Cookie。
 */
@Injectable()
export class BilibiliService {
  private readonly logger = new Logger(BilibiliService.name);

  constructor(private readonly configService: ConfigService) {}

  /** 未配置时返回 null（无 Cookie 模式，仅可能命中公开 CC 字幕） */
  getCookieFile(): string | null {
    const value = this.configService.get<string>('BILI_COOKIE_FILE')?.trim();
    return value || null;
  }

  /**
   * Cookie 过期时抛出明确错误；未配置 Cookie、Cookie 解析不出 B 站字段、
   * 或探测网络异常时静默放行（不阻断，后续没有字幕会按「未找到字幕」失败）。
   */
  async assertLoginAlive(): Promise<void> {
    const cookieFile = this.getCookieFile();
    if (!cookieFile) return;

    const cookieHeader = await this.readBilibiliCookieHeader(cookieFile);
    if (!cookieHeader) return;

    try {
      const response = await fetch(BILIBILI_NAV_API, {
        headers: {
          cookie: cookieHeader,
          'user-agent': REQUEST_UA,
          referer: 'https://www.bilibili.com/',
        },
        signal: AbortSignal.timeout(LOGIN_PROBE_TIMEOUT_MS),
      });
      const body = (await response.json().catch(() => null)) as
        | { code?: number; data?: { isLogin?: boolean } }
        | null;
      if (!body) return;

      const notLoggedIn = body.code === -101 || body.data?.isLogin === false;
      if (notLoggedIn) {
        throw new BadRequestException('B站 Cookie 已过期，请替换 cookie 文件后重新导入');
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      // 网络异常 / 响应结构异常：探测是 best-effort，不阻断导入
      this.logger.warn(`B站登录态探测失败（忽略）：${String(error)}`);
    }
  }

  /**
   * 解析 cookies.txt，拼出请求头用的 Cookie 串。
   * 只取 B 站域名的字段；兼容 `#HttpOnly_` 前缀行（SESSDATA 常是 HttpOnly）。
   */
  private async readBilibiliCookieHeader(cookieFile: string): Promise<string | null> {
    let content: string;
    try {
      content = await readFile(cookieFile, 'utf8');
    } catch {
      this.logger.warn(`B站 cookie 文件不可读：${cookieFile}`);
      return null;
    }

    const pairs: string[] = [];
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      const isHttpOnly = line.startsWith('#HttpOnly_');
      if (line.startsWith('#') && !isHttpOnly) continue;

      const columns = (isHttpOnly ? line.slice('#HttpOnly_'.length) : line).split('\t');
      if (columns.length < 7) continue;

      const [domain, , , , , name, value] = columns;
      if (!domain.includes('bilibili')) continue;
      if (name && value !== undefined) pairs.push(`${name}=${value}`);
    }

    return pairs.length ? pairs.join('; ') : null;
  }
}
