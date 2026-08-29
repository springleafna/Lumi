import type { ChatMessage } from '../ai-provider.service';

export type DocumentQuestionPromptInput = {
  title: string;
  question: string;
  articleText: string;
  analysisSummary?: string;
};

// 单文档问答不做检索，直接提供全文；超长文档截断，避免超出上下文窗口。
const MAX_ARTICLE_CHARS = 40_000;

export function buildDocumentQuestionMessages(input: DocumentQuestionPromptInput): ChatMessage[] {
  const articleText =
    input.articleText.length > MAX_ARTICLE_CHARS
      ? `${input.articleText.slice(0, MAX_ARTICLE_CHARS)}\n\n[文章过长，后续内容已截断]`
      : input.articleText;

  return [
    {
      role: 'system',
      content:
        '你是 Lumi 的中文阅读问答助手，基于提供的文章全文回答问题。回答使用中文，可以用 Markdown 组织格式。文章中没有的内容要如实说明，不要编造。',
    },
    {
      role: 'user',
      content: [
        `文章标题：${input.title}`,
        input.analysisSummary ? `已有摘要：${input.analysisSummary}` : '',
        `用户问题：${input.question}`,
        `文章全文：\n${articleText}`,
        '请给出简洁但有帮助的中文回答。',
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];
}
