import {
  chunkTranscriptByWindow,
  formatTimestamp,
  normalizeAnchors,
  normalizeSegments,
  parseSubtitleFile,
} from './transcript.utils';

describe('transcript.utils', () => {
  describe('parseSubtitleFile', () => {
    it('解析 srt（逗号毫秒、带序号行）', () => {
      const content = [
        '1',
        '00:00:01,240 --> 00:00:03,860',
        '大家好，今天讲一下',
        'OpenSpec 的用法',
        '',
        '2',
        '00:00:04,000 --> 00:00:06,500',
        '首先是安装。',
        '',
      ].join('\n');

      expect(parseSubtitleFile(content)).toEqual([
        { start: 1.24, end: 3.86, text: '大家好，今天讲一下OpenSpec 的用法' },
        { start: 4, end: 6.5, text: '首先是安装。' },
      ]);
    });

    it('解析 vtt（点号毫秒、标记与内联时间戳）', () => {
      const content = [
        'WEBVTT',
        '',
        '00:00:01.000 --> 00:00:02.500 align:start line:0%',
        '<c>第一句话</c>',
        '',
        '00:00:03.000 --> 00:00:04.000',
        '<00:00:03.500><c>第二句</c>',
        '',
      ].join('\n');

      expect(parseSubtitleFile(content)).toEqual([
        { start: 1, end: 2.5, text: '第一句话' },
        { start: 3, end: 4, text: '第二句' },
      ]);
    });
  });

  describe('normalizeSegments', () => {
    it('合并相邻重复文本（滚动字幕残留）', () => {
      const segments = normalizeSegments([
        { start: 1, end: 2, text: '同一句话。' },
        { start: 2, end: 3.5, text: '同一句话。' },
        { start: 6, end: 7, text: '新内容。' },
      ]);

      expect(segments).toEqual([
        { start: 1, end: 3.5, text: '同一句话。' },
        { start: 6, end: 7, text: '新内容。' },
      ]);
    });

    it('前句未完且间隔短时聚句', () => {
      const segments = normalizeSegments([
        { start: 1, end: 2, text: '我们先来看' },
        { start: 2.2, end: 3, text: '第一个方案。' },
        { start: 10, end: 11, text: '接下来是总结。' },
      ]);

      expect(segments).toEqual([
        { start: 1, end: 3, text: '我们先来看第一个方案。' },
        { start: 10, end: 11, text: '接下来是总结。' },
      ]);
    });

    it('已完结的句子不合并', () => {
      const segments = normalizeSegments([
        { start: 1, end: 2, text: '第一句讲完了。' },
        { start: 2.1, end: 3, text: '第二句开始。' },
      ]);

      expect(segments).toEqual([
        { start: 1, end: 2, text: '第一句讲完了。' },
        { start: 2.1, end: 3, text: '第二句开始。' },
      ]);
    });

    it('间隔超过阈值时不再聚句', () => {
      const segments = normalizeSegments([
        { start: 1, end: 2, text: '上一句还没说完' },
        { start: 3, end: 4, text: '停顿后的新句子' },
      ]);

      expect(segments).toEqual([
        { start: 1, end: 2, text: '上一句还没说完' },
        { start: 3, end: 4, text: '停顿后的新句子' },
      ]);
    });

    it('AI 字幕无标点时按句长上限断句，不会串成整段', () => {
      // 模拟 B 站 AI 字幕：无标点、cue 无缝衔接
      const segments = normalizeSegments(
        Array.from({ length: 40 }, (_, i) => ({
          start: i * 2,
          end: i * 2 + 2,
          text: `第${String(i).padStart(2, '0')}句无标点内容`,
        })),
      );

      // 每条 9 字，80 字上限 → 约每 8 条断为一段
      expect(segments.length).toBeGreaterThanOrEqual(4);
      expect(segments.length).toBeLessThanOrEqual(6);
      for (const segment of segments) {
        expect(segment.text.length).toBeLessThanOrEqual(80);
      }
    });

    it('聚句同时受时长上限约束', () => {
      const segments = normalizeSegments([
        { start: 0, end: 20, text: '无标点的长句' },
        { start: 20, end: 40, text: '继续无标点' },
      ]);

      expect(segments).toEqual([
        { start: 0, end: 20, text: '无标点的长句' },
        { start: 20, end: 40, text: '继续无标点' },
      ]);
    });

    it('过滤空文本；空段不参与重叠裁剪', () => {
      const segments = normalizeSegments([
        { start: 1, end: 3, text: '   ' },
        { start: 2, end: 4, text: '重叠的句子' },
        { start: 4.5, end: 4, text: '时间倒挂' },
      ]);

      expect(segments).toEqual([{ start: 2, end: 4, text: '重叠的句子' }]);
    });
  });

  describe('chunkTranscriptByWindow', () => {
    const segments = [
      { start: 0, end: 10, text: '第一段。' },
      { start: 10, end: 20, text: '第二段。' },
      { start: 700, end: 710, text: '第三段。' },
    ];

    it('时间超窗时切分，且分块文本带每句时间戳', () => {
      const chunks = chunkTranscriptByWindow(segments, 10_000, 600);
      expect(chunks).toEqual([
        { startTime: 0, endTime: 20, text: '[00:00] 第一段。\n[00:10] 第二段。' },
        { startTime: 700, endTime: 710, text: '[11:40] 第三段。' },
      ]);
    });

    it('字数超限时在句边界切分', () => {
      const long = [
        { start: 0, end: 5, text: 'a'.repeat(30) },
        { start: 5, end: 10, text: 'b'.repeat(30) },
      ];
      const chunks = chunkTranscriptByWindow(long, 40, 600);
      expect(chunks).toHaveLength(2);
      expect(chunks[0].text).toBe(`[00:00] ${'a'.repeat(30)}`);
      expect(chunks[1].text).toBe(`[00:05] ${'b'.repeat(30)}`);
    });
  });

  describe('formatTimestamp', () => {
    it('格式化为 mm:ss', () => {
      expect(formatTimestamp(0)).toBe('00:00');
      expect(formatTimestamp(61)).toBe('01:01');
      expect(formatTimestamp(754.6)).toBe('12:34');
    });
  });

  describe('normalizeAnchors', () => {
    const segments = [
      { start: 60, end: 65, text: 'a' },
      { start: 655, end: 660, text: 'b' },
    ];

    it('容差内的锚点吸附到真实字幕时间', () => {
      expect(normalizeAnchors('结论见 [01:01]。', segments)).toBe('结论见 [01:00]。');
      expect(normalizeAnchors('## [10:56] 章节', segments)).toBe('## [10:55] 章节');
    });

    it('编造的锚点被移除', () => {
      expect(normalizeAnchors('不存在的时间 [05:12]。', segments)).toBe('不存在的时间 。');
    });

    it('无字幕时原样返回', () => {
      expect(normalizeAnchors('keep [01:00]', [])).toBe('keep [01:00]');
    });
  });
});
