import { buildAnalysisMessages } from './analysis';
import { EDITORIAL_FIDELITY_RULES } from './editorial-rules';

function joinMessages(messages: { role: string; content: string }[]): string {
  return messages.map((message) => message.content).join('\n');
}

describe('buildAnalysisMessages', () => {
  it('包含 keyPoints 约束与忠实性写作规则', () => {
    const text = joinMessages(
      buildAnalysisMessages({
        title: '测试文章',
        contentText: '正文内容',
      }),
    );
    expect(text).toContain('keyPoints 为 3-8 条关键要点');
    expect(text).toContain(EDITORIAL_FIDELITY_RULES);
    expect(text).toContain('区分"百分比"和"百分点"');
  });

  it('正文超过 40000 字符时截断并追加标记', () => {
    const text = joinMessages(
      buildAnalysisMessages({
        title: '测试文章',
        contentText: 'a'.repeat(50_000),
      }),
    );
    expect(text).toContain('[内容已截断]');
  });

  it('注入已有标签引导', () => {
    const text = joinMessages(
      buildAnalysisMessages({
        title: '测试文章',
        contentText: '正文内容',
        existingTags: ['效率', '工具'],
      }),
    );
    expect(text).toContain('知识库已有标签（按使用频率排序）：效率、工具');
  });
});
