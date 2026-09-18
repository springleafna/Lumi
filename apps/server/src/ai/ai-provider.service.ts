import { BadRequestException, forwardRef, Inject, Injectable } from '@nestjs/common';
import type { RuntimeAiConfig } from '../settings/settings.service';
import { SettingsService } from '../settings/settings.service';
import { buildConnectionTestMessages } from './prompts/connection-test';
import { splitEmbeddingBatches } from '../common/text.utils';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

@Injectable()
export class AiProviderService {
  constructor(
    @Inject(forwardRef(() => SettingsService))
    private readonly settingsService: SettingsService,
  ) {}

  async getChatConfig(): Promise<RuntimeAiConfig> {
    return this.settingsService.getChatRuntimeConfig();
  }

  async getEmbeddingConfig(): Promise<RuntimeAiConfig> {
    return this.settingsService.getEmbeddingRuntimeConfig();
  }

  async chatJson(messages: ChatMessage[], temperature = 0.2): Promise<string> {
    const config = await this.getChatConfig();
    return this.chatJsonWithConfig(config, messages, temperature);
  }

  /** 纯文本生成：与 chatJson 的区别是不强制 response_format JSON 模式 */
  async chatText(messages: ChatMessage[], temperature = 0.2): Promise<string> {
    const config = await this.getChatConfig();
    return this.chatWithConfig(config, messages, temperature, false);
  }

  async chatJsonWithConfig(
    config: RuntimeAiConfig,
    messages: ChatMessage[],
    temperature = 0.2,
  ): Promise<string> {
    return this.chatWithConfig(config, messages, temperature, true);
  }

  private async chatWithConfig(
    config: RuntimeAiConfig,
    messages: ChatMessage[],
    temperature: number,
    jsonMode: boolean,
  ): Promise<string> {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
    });

    if (!response.ok) {
      throw new BadRequestException(
        translateProviderError('AI 调用失败', response.status, await readResponseText(response)),
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new BadRequestException('AI 返回内容为空');
    }
    return content;
  }

  async *streamChat(
    messages: ChatMessage[],
    temperature = 0.2,
    signal?: AbortSignal,
  ): AsyncIterable<string> {
    const config = await this.getChatConfig();
    yield* this.streamChatWithConfig(config, messages, temperature, signal);
  }

  async *streamChatWithConfig(
    config: RuntimeAiConfig,
    messages: ChatMessage[],
    temperature = 0.2,
    signal?: AbortSignal,
  ): AsyncIterable<string> {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature,
        stream: true,
      }),
      signal,
    });

    if (!response.ok || !response.body) {
      throw new BadRequestException(
        translateProviderError('AI 调用失败', response.status, await readResponseText(response)),
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;

        try {
          const data = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const content = data.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          // Ignore malformed streaming fragments from provider.
        }
      }
    }
  }

  async embedTexts(texts: string[]): Promise<{
    config: RuntimeAiConfig;
    vectors: number[][];
    dimension: number;
  }> {
    const config = await this.settingsService.getEmbeddingRuntimeConfig();
    const result = await this.embedTextsWithConfig(config, texts);
    await this.settingsService.updateEmbeddingDimension(result.dimension);
    return { config, ...result };
  }

  async embedTextsWithConfig(
    config: RuntimeAiConfig,
    texts: string[],
  ): Promise<{ vectors: number[][]; dimension: number }> {
    // 单次批量超限会被供应商 / 中转网关以 {"data":null} 之类的异常响应拒绝，
    // 按条数与总字符数分批发送
    const batches = splitEmbeddingBatches(texts);
    const vectors: number[][] = [];
    let dimension = 0;

    for (const batch of batches) {
      const batchVectors = await this.embedBatchWithConfig(config, batch);
      vectors.push(...batchVectors);
      dimension = batchVectors[0]?.length ?? dimension;
    }

    if (vectors.length !== texts.length || !vectors[0]?.length) {
      throw new BadRequestException('Embedding 返回内容不完整');
    }

    return { vectors, dimension };
  }

  private async embedBatchWithConfig(
    config: RuntimeAiConfig,
    texts: string[],
  ): Promise<number[][]> {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      throw new BadRequestException(
        translateProviderError(
          'Embedding 调用失败',
          response.status,
          await readResponseText(response),
        ),
      );
    }

    const data = (await response.json()) as {
      data?: Array<{ embedding?: number[] }> | null;
    };
    if (!Array.isArray(data.data)) {
      throw new BadRequestException(
        'Embedding 服务返回了异常响应（data 为空），请检查 Embedding 配置或稍后重试',
      );
    }

    const vectors = data.data
      .map((item) => item.embedding)
      .filter((item): item is number[] => Array.isArray(item));

    if (vectors.length !== texts.length || !vectors[0]?.length) {
      throw new BadRequestException('Embedding 返回内容不完整');
    }

    const dimension = vectors[0].length;
    if (vectors.some((vector) => vector.length !== dimension)) {
      throw new BadRequestException('Embedding 返回向量维度不一致');
    }

    return vectors;
  }

  async testChatConfig(config: RuntimeAiConfig): Promise<void> {
    await this.chatJsonWithConfig(config, buildConnectionTestMessages(), 0);
  }

  async testEmbeddingConfig(config: RuntimeAiConfig): Promise<number> {
    const result = await this.embedTextsWithConfig(config, ['Lumi 连接测试']);
    return result.dimension;
  }
}

async function readResponseText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

/**
 * 把供应商返回的错误体翻译成友好文案：能识别的错误给中文提示，
 * 识别不了的原样透传（含状态码上下文）。
 */
export function translateProviderError(prefix: string, status: number, body: string): string {
  const text = body.trim();
  const lower = text.toLowerCase();

  if (status === 402 || lower.includes('insufficient balance') || lower.includes('余额不足')) {
    return `${prefix}：AI 服务商账户余额不足，请前往服务商控制台充值或更换 API Key 后重试`;
  }
  if (status === 401 || lower.includes('invalid api key') || lower.includes('unauthorized')) {
    return `${prefix}：API Key 无效或已失效，请检查 AI 配置`;
  }
  if (status === 429 || lower.includes('rate limit')) {
    return `${prefix}：AI 服务商限流中，请稍后重试`;
  }
  if (status === 404) {
    return `${prefix}：接口地址或模型不存在，请检查 AI 配置中的 Base URL 与模型名`;
  }

  return `${prefix}：${text || `${status} ${response_statusTextFallback(status)}`}`;
}

function response_statusTextFallback(status: number): string {
  const texts: Record<number, string> = {
    400: '请求参数错误',
    402: '需要付费',
    413: '请求内容过长',
    500: '服务商内部错误',
    502: '服务商网关错误',
    503: '服务商暂时不可用',
  };
  return texts[status] ?? '请求失败';
}
