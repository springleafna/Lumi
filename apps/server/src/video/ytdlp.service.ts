import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { truncate } from '../common/text.utils';

/**
 * yt-dlp 子进程运行器：仅负责「拿元数据」与「下载字幕」两件事，
 * 不下载视频与音频（音频提取属 M2 语音转写范畴）。
 *
 * 一律 execFile 参数数组调用，URL 不经过 shell；二进制路径可用
 * YT_DLP_PATH 覆盖，默认取 PATH 中的 yt-dlp。
 */

const METADATA_TIMEOUT_MS = 60_000;
const SUBTITLE_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

export type YtDlpSubtitleTrack = { url: string; ext?: string };

export type YtDlpMetadata = {
  id?: string;
  title?: string;
  uploader?: string;
  duration?: number;
  thumbnail?: string;
  /** 直播 / 即将开播等场景 */
  is_live?: boolean;
  subtitles?: Record<string, YtDlpSubtitleTrack[] | undefined>;
  automatic_captions?: Record<string, YtDlpSubtitleTrack[] | undefined>;
};

@Injectable()
export class YtDlpService {
  private readonly logger = new Logger(YtDlpService.name);

  constructor(private readonly configService: ConfigService) {}

  async fetchMetadata(url: string): Promise<YtDlpMetadata> {
    const stdout = await this.run(
      [...this.cookieArgs(), '-J', '--no-playlist', url],
      METADATA_TIMEOUT_MS,
    );

    try {
      return JSON.parse(stdout) as YtDlpMetadata;
    } catch {
      throw new BadRequestException('视频解析失败：yt-dlp 返回了无法识别的内容');
    }
  }

  /**
   * 下载候选语言的字幕到 outputTemplate（不含扩展名），返回生成的
   * 全部 srt/vtt 文件路径。yt-dlp 对 B 站字幕是懒提取，因此字幕的
   * 获取完全依赖这次调用（-J 元数据里字幕字段为空）。候选里没有的
   * 语言不会产出文件；找不到任何 srt/vtt 产物返回空数组。
   */
  async downloadSubtitles(
    url: string,
    langs: string[],
    outputTemplate: string,
  ): Promise<string[]> {
    await this.run(
      [
        ...this.cookieArgs(),
        '--write-subs',
        '--write-auto-subs',
        '--sub-langs',
        langs.join(','),
        '--sub-format',
        'srt/vtt/best',
        '--skip-download',
        '--no-playlist',
        '-o',
        outputTemplate,
        url,
      ],
      SUBTITLE_TIMEOUT_MS,
    );

    const directory = join(outputTemplate, '..');
    const files = await readdir(directory);
    return files
      .filter((file) => /\.(srt|vtt)$/i.test(file))
      .map((file) => join(directory, file));
  }

  private cookieArgs(): string[] {
    const cookieFile = this.configService.get<string>('BILI_COOKIE_FILE')?.trim();
    return cookieFile ? ['--cookies', cookieFile] : [];
  }

  private binaryPath(): string {
    return this.configService.get<string>('YT_DLP_PATH')?.trim() || 'yt-dlp';
  }

  private run(args: string[], timeoutMs: number): Promise<string> {
    const binary = this.binaryPath();
    return new Promise((resolve, reject) => {
      execFile(
        binary,
        args,
        { timeout: timeoutMs, maxBuffer: MAX_OUTPUT_BYTES, windowsHide: true },
        (error, stdout, stderr) => {
          if (error) {
            this.logger.warn(`yt-dlp 执行失败: ${truncate(stderr || error.message, 300)}`);
            reject(
              new BadRequestException(
                '视频解析失败（yt-dlp），可尝试升级 yt-dlp 后重试',
              ),
            );
            return;
          }
          resolve(stdout);
        },
      );
    });
  }
}
