import type { ChatMessage } from '../ai-provider.service';
import { truncate } from '../../common/text.utils';

export type AnalysisPromptInput = {
  title: string;
  source?: string | null;
  author?: string | null;
  excerpt?: string | null;
  contentText?: string | null;
};

// 正文送入提示词前的长度上限，避免超出上下文窗口。
const MAX_ANALYSIS_CHARS = 18_000;

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
        `标题：${input.title}`,
        `来源：${input.source || '未知'}`,
        `作者：${input.author || '未知'}`,
        `摘要：${input.excerpt || '无'}`,
        `正文：${truncate(input.contentText || '', MAX_ANALYSIS_CHARS)}`,
      ].join('\n\n'),
    },
  ];
}
