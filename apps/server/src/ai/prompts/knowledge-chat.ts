import type { ChatMessage } from '../ai-provider.service';
import { truncate } from '../../common/text.utils';
import { formatTimestamp } from '../../video/transcript.utils';

export type KnowledgeChatPromptSource = {
  documentTitle: string;
  chunks: Array<{
    content: string;
    startSeconds?: number | null;
    endSeconds?: number | null;
  }>;
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
            .map((chunk) => {
              // 视频片段带时间头，模型可在回答中引用时间点
              const header =
                typeof chunk.startSeconds === 'number' && typeof chunk.endSeconds === 'number'
                  ? `[${formatTimestamp(chunk.startSeconds)} - ${formatTimestamp(chunk.endSeconds)}]\n`
                  : '';
              return `${header}${truncate(chunk.content, 900)}`;
            })
            .join('\n---\n');
          return `[${index + 1}] 标题：${source.documentTitle}\n片段：${fragments}`;
        })
        .join('\n\n')
    : '没有召回到足够相关的知识库片段。';
  const hasVideoSource = input.sources.some((source) =>
    source.chunks.some((chunk) => typeof chunk.startSeconds === 'number'),
  );

  return [
    {
      role: 'system',
      content: hasVideoSource
        ? '你是 Lumi 的知识库问答助手。只能基于提供的知识库片段回答，默认使用中文。不要使用模型常识自由发挥。资料不足时必须明确说明“知识库中没有足够依据回答这个问题”。编号 [1] [2] 各对应一篇文档，同一编号下可能有多段内容；带 [mm:ss - mm:ss] 时间头的片段来自视频字幕，涉及该内容时可在句中自然标注对应时间点。回答中只标注实际参考了的编号，没有用到的来源不要标注。'
        : '你是 Lumi 的知识库问答助手。只能基于提供的知识库片段回答，默认使用中文。不要使用模型常识自由发挥。资料不足时必须明确说明“知识库中没有足够依据回答这个问题”。编号 [1] [2] 各对应一篇文章，同一编号下可能有多段内容；回答中只标注实际参考了的编号，没有用到的来源不要标注。',
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
