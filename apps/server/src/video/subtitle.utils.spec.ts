import {
  pickPreferredSubtitleLang,
  subtitleProvider,
} from './subtitle.utils';

describe('pickPreferredSubtitleLang', () => {
  it('CC 中文字幕优先于 AI 字幕', () => {
    expect(pickPreferredSubtitleLang(['ai-zh', 'zh-CN'])).toBe('zh-CN');
  });

  it('无 CC 时选中 AI 中文字幕', () => {
    expect(pickPreferredSubtitleLang(['ai-zh', 'ai-en', 'ai-ja'])).toBe('ai-zh');
  });

  it('其他中文变体参与兜底', () => {
    expect(pickPreferredSubtitleLang(['zh-Hant', 'ai-en'])).toBe('zh-Hant');
  });

  it('danmaku 被排除', () => {
    expect(pickPreferredSubtitleLang(['danmaku', 'ai-en'])).toBe('ai-en');
    expect(pickPreferredSubtitleLang(['danmaku'])).toBeNull();
  });

  it('完全无候选时返回 null', () => {
    expect(pickPreferredSubtitleLang([])).toBeNull();
  });
});

describe('subtitleProvider', () => {
  it('ai-* 视为 AI 字幕，其余视为 CC', () => {
    expect(subtitleProvider('ai-zh')).toBe('bilibili-ai');
    expect(subtitleProvider('zh-CN')).toBe('bilibili-cc');
  });
});
