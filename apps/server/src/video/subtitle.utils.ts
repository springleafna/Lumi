/**
 * 字幕挑选策略（作用于已下载的字幕文件语言列表）。
 *
 * 经验事实（来自 B 站实测）：
 * - yt-dlp 的 Bilibili extractor 把 AI 字幕（ai-zh / ai-en…）与 danmaku（弹幕，
 *   xml 格式，不是语音字幕）一起返回，必须排除 danmaku；
 * - 新版 yt-dlp 对 B 站字幕是懒提取：`-J` 元数据里 subtitles / automatic_captions
 *   为空，只有 --list-subs / --write-subs 才会真正请求字幕接口。因此挑选逻辑
 *   不依赖元数据，而是对下载产物按语言排序。
 *
 * 优先级：CC 中文字幕 > AI 中文字幕 > 其他中文 > 其他语言。
 */

const DANMAKU_LANG = 'danmaku';

const CC_PREFERRED_LANGS = ['zh-CN', 'zh-Hans', 'zh', 'zh-TW', 'zh-Hant'];
const AI_PREFERRED_LANGS = ['ai-zh', 'ai-zh-Hans'];

export type SubtitleProvider = 'bilibili-cc' | 'bilibili-ai';

export function isDanmakuLang(lang: string): boolean {
  return lang.toLowerCase() === DANMAKU_LANG;
}

export function subtitleProvider(lang: string): SubtitleProvider {
  return lang.toLowerCase().startsWith('ai-') ? 'bilibili-ai' : 'bilibili-cc';
}

export function pickPreferredSubtitleLang(langs: string[]): string | null {
  const usable = langs.filter((lang) => !isDanmakuLang(lang));
  if (!usable.length) return null;

  return (
    pickExact(usable, CC_PREFERRED_LANGS) ??
    pickExact(usable, AI_PREFERRED_LANGS) ??
    usable.find(isChineseLang) ??
    usable[0]
  );
}

function pickExact(langs: string[], preferred: string[]): string | null {
  return preferred.find((lang) => langs.includes(lang)) ?? null;
}

function isChineseLang(lang: string): boolean {
  return lang.toLowerCase().startsWith('zh');
}
