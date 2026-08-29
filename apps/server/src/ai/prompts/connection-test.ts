import type { ChatMessage } from '../ai-provider.service';

export function buildConnectionTestMessages(): ChatMessage[] {
  return [
    { role: 'system', content: '你是 Lumi 的连接测试助手。必须只输出 JSON。' },
    { role: 'user', content: '请输出 {"ok":true}' },
  ];
}
