import { BadRequestException } from '@nestjs/common';

export const MAX_HTML_BYTES = 5 * 1024 * 1024;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_SELECTION_BYTES = 200 * 1024;

export function validateHtml(value: string): string {
  const html = value?.trim();
  if (!html) {
    throw new BadRequestException('页面内容为空');
  }

  if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
    throw new BadRequestException('页面内容过大，暂不支持保存');
  }

  return html;
}
