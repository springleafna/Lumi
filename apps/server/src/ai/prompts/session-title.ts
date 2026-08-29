import type { ChatMessage } from '../ai-provider.service';
import { truncate } from '../../common/text.utils';

export function buildSessionTitleMessages(input: {
  question: string;
  answer: string;
}): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        '你是 Lumi 的会话标题助手。请根据用户问题和回答生成一个 6-20 个中文字符的标题，只输出 JSON。',
    },
    {
      role: 'user',
      content: [
        '请输出 {"title":"标题"}。',
        `问题：${input.question}`,
        `回答：${truncate(input.answer, 1200)}`,
      ].join('\n\n'),
    },
  ];
}
