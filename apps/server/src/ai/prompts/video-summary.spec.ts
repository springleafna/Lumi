import {
  buildVideoMapMessages,
  buildVideoReduceMessages,
  buildVideoSinglePassMessages,
} from './video-summary';

function joinMessages(messages: { role: string; content: string }[]): string {
  return messages.map((message) => message.content).join('\n');
}

describe('buildVideoMapMessages', () => {
  it('包含细节保全要求与锚点约束', () => {
    const text = joinMessages(
      buildVideoMapMessages({
        title: '测试视频',
        chunkText: '[00:00] 正文内容',
        startTime: 0,
        endTime: 600,
      }),
    );
    expect(text).toContain('400-600 字');
    expect(text).toContain('不要抽象化概括');
    expect(text).toContain('工具名、人名、产品名、术语照原文写');
    expect(text).toContain('[mm:ss]');
    expect(text).toContain('[00:00 - 10:00]');
  });
});

describe('buildVideoReduceMessages', () => {
  const chunkSummaries = [
    { startTime: 0, endTime: 600, summary: '第一块小结' },
    { startTime: 600, endTime: 1200, summary: '第二块小结' },
  ];

  it('速览模式使用紧凑篇幅与要点式结构', () => {
    const text = joinMessages(
      buildVideoReduceMessages({
        title: '测试视频',
        durationSeconds: 300,
        mode: 'brief',
        chunkSummaries,
      }),
    );
    expect(text).toContain('500-800 字，划分 2-3 个章节');
    expect(text).toContain('无序列表写 2-5 条要点');
    expect(text).toContain('keyPoints 为 3-8 条');
    expect(text).toContain('取自分块小结中出现的时间点');
    expect(text).not.toContain('机制原理');
  });

  it('精读模式按时长分档并注入主线画像与写作规则', () => {
    const text = joinMessages(
      buildVideoReduceMessages({
        title: '测试视频',
        durationSeconds: 2400,
        mode: 'standard',
        chunkSummaries,
      }),
    );
    expect(text).toContain('2500-3500 字，划分 6-9 个章节');
    expect(text).toContain('机制原理、操作教程、证据论证、观点讨论、事件叙事');
    expect(text).toContain('Markdown 表格');
    expect(text).toContain('keyPoints 为 5-10 条');
    expect(text).toContain('区分"百分比"和"百分点"');
    expect(text).not.toContain('无序列表写 2-5 条要点');
  });

  it('精读模式对 10 分钟内视频使用短篇幅档位', () => {
    const text = joinMessages(
      buildVideoReduceMessages({
        title: '测试视频',
        durationSeconds: 480,
        mode: 'standard',
        chunkSummaries,
      }),
    );
    expect(text).toContain('1000-1500 字，划分 3-5 个章节');
  });

  it('包含分块小结原文与已有标签引导', () => {
    const text = joinMessages(
      buildVideoReduceMessages({
        title: '测试视频',
        durationSeconds: 300,
        mode: 'brief',
        chunkSummaries,
        existingTags: ['效率', '工具'],
      }),
    );
    expect(text).toContain('[00:00 - 10:00] 第一块小结');
    expect(text).toContain('[10:00 - 20:00] 第二块小结');
    expect(text).toContain('知识库已有标签（按使用频率排序）：效率、工具');
  });

  it('重新生成（bodyOnly）只要正文，不包含阅读卡字段与标签要求', () => {
    const text = joinMessages(
      buildVideoReduceMessages({
        title: '测试视频',
        durationSeconds: 2400,
        mode: 'standard',
        chunkSummaries,
        existingTags: ['效率'],
        bodyOnly: true,
      }),
    );
    expect(text).toContain('只输出 JSON，字段：markdown。');
    expect(text).not.toContain('keyPoints 为');
    expect(text).not.toContain('知识库已有标签');
    expect(text).toContain('2500-3500 字，划分 6-9 个章节');
  });
});

describe('buildVideoSinglePassMessages', () => {
  const transcriptText = '[00:00] 第一句\n[00:30] 第二句';

  it('包含完整字幕与 JSON 字段契约', () => {
    const text = joinMessages(
      buildVideoSinglePassMessages({
        title: '测试视频',
        durationSeconds: 600,
        mode: 'brief',
        transcriptText,
      }),
    );
    expect(text).toContain('markdown, oneSentenceSummary, keyPoints, concepts, tags');
    expect(text).toContain('完整字幕（每行开头的 [mm:ss] 是该句在视频中的时间）：');
    expect(text).toContain('[00:30] 第二句');
    expect(text).toContain('取自字幕中出现的时间点');
    expect(text).toContain('不要按字幕顺序逐段复述');
  });

  it('精读模式注入主线画像与篇幅档位', () => {
    const text = joinMessages(
      buildVideoSinglePassMessages({
        title: '测试视频',
        durationSeconds: 1200,
        mode: 'standard',
        transcriptText,
      }),
    );
    expect(text).toContain('1800-2800 字，划分 5-8 个章节');
    expect(text).toContain('机制原理、操作教程、证据论证、观点讨论、事件叙事');
    expect(text).toContain('区分"百分比"和"百分点"');
  });

  it('重新生成（bodyOnly）只要正文字段', () => {
    const text = joinMessages(
      buildVideoSinglePassMessages({
        title: '测试视频',
        durationSeconds: 600,
        mode: 'brief',
        transcriptText,
        existingTags: ['效率'],
        bodyOnly: true,
      }),
    );
    expect(text).toContain('只输出 JSON，字段：markdown。');
    expect(text).not.toContain('keyPoints 为');
    expect(text).not.toContain('知识库已有标签');
    expect(text).toContain('完整字幕（每行开头的 [mm:ss] 是该句在视频中的时间）：');
  });
});
