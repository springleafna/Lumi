import type { ChatMessage } from '../ai-provider.service';
import { truncate } from '../../common/text.utils';

export type KnowledgeChatPromptSource = {
  documentTitle: string;
  chunks: Array<{ content: string }>;
};

export function buildKnowledgeChatMessages(input: {
  question: string;
  history: string;
  sources: KnowledgeChatPromptSource[];
}): ChatMessage[] {
  const citationText = input.sources.length
    ? input.sources
        .map((source, index) => {
          const fragments = source.chunks
            .map((chunk) => truncate(chunk.content, 900))
            .join('\n---\n');
          return `[${index + 1}] 标题：${source.documentTitle}\n片段：${fragments}`;
        })
        .join('\n\n')
    : '没有召回到足够相关的知识库片段。';

  return [
    {
      role: 'system',
      content:
        '你是 Lumi 的知识库问答助手。只能基于提供的知识库片段回答，默认使用中文。不要使用模型常识自由发挥。资料不足时必须明确说明“知识库中没有足够依据回答这个问题”。编号 [1] [2] 各对应一篇文章，同一编号下可能有多段内容；回答中只标注实际参考了的编号，没有用到的来源不要标注。',
    },
    {
      role: 'user',
      content: [
        input.history ? `当前会话上下文：\n${input.history}` : '',
        `用户问题：${input.question}`,
        `知识库片段：\n${citationText}`,
        '请给出可信、克制的中文回答。若使用了片段，请在相关句子后标注对应的来源编号。',
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];
}
