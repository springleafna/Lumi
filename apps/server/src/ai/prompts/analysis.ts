import type { ChatMessage } from '../ai-provider.service';
import { truncate } from '../../common/text.utils';
import { EDITORIAL_FIDELITY_RULES } from './editorial-rules';

export type AnalysisPromptInput = {
  title: string;
  source?: string | null;
  author?: string | null;
  excerpt?: string | null;
  contentText?: string | null;
  existingTags?: string[];
};

// 正文送入提示词前的长度上限，避免超出上下文窗口（与单文档问答的 40k 对齐）。
const MAX_ANALYSIS_CHARS = 40_000;

export function buildAnalysisMessages(input: AnalysisPromptInput): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        '你是 Lumi 的中文阅读助手。请只基于用户提供的文章内容分析，不要编造。必须只输出 JSON，不要输出 Markdown。',
    },
    {
      role: 'user',
      content: [
        '请对下面文章生成结构化阅读卡片，字段必须包含：oneSentenceSummary, summary, keyPoints, concepts, actions, audience, tags。',
        '要求：摘要、要点、标签均使用中文；tags 为 1-3 个短中文标签；keyPoints/concepts/actions 使用字符串数组。',
        'summary 为 150-300 字的段落摘要；keyPoints 为 3-8 条关键要点，保留文章中的具体数字、条件与结论，不要抽象概括成空泛说法。',
        '写作规则：',
        EDITORIAL_FIDELITY_RULES,
        input.existingTags?.length
          ? `知识库已有标签（按使用频率排序）：${input.existingTags.join('、')}。tags 必须优先从这些已有标签中选择，确实没有语义合适的才新建。`
          : '',
        `标题：${input.title}`,
        `来源：${input.source || '未知'}`,
        `作者：${input.author || '未知'}`,
        `摘要：${input.excerpt || '无'}`,
        `正文：${truncate(input.contentText || '', MAX_ANALYSIS_CHARS)}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];
}
