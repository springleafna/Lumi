import { BadRequestException, forwardRef, Inject, Injectable } from '@nestjs/common';
import type { RuntimeAiConfig } from '../settings/settings.service';
import { SettingsService } from '../settings/settings.service';

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

  async chatJsonWithConfig(
    config: RuntimeAiConfig,
    messages: ChatMessage[],
    temperature = 0.2,
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
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      throw new BadRequestException(`AI 调用失败：${await readResponseText(response)}`);
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
      throw new BadRequestException(`AI 调用失败：${await readResponseText(response)}`);
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
      throw new BadRequestException(`Embedding 调用失败：${await readResponseText(response)}`);
    }

    const data = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const vectors = (data.data || [])
      .map((item) => item.embedding)
      .filter((item): item is number[] => Array.isArray(item));

    if (vectors.length !== texts.length || !vectors[0]?.length) {
      throw new BadRequestException('Embedding 返回内容不完整');
    }

    const dimension = vectors[0].length;
    if (vectors.some((vector) => vector.length !== dimension)) {
      throw new BadRequestException('Embedding 返回向量维度不一致');
    }

    return { vectors, dimension };
  }

  async testChatConfig(config: RuntimeAiConfig): Promise<void> {
    await this.chatJsonWithConfig(
      config,
      [
        { role: 'system', content: '你是 Lumi 的连接测试助手。必须只输出 JSON。' },
        { role: 'user', content: '请输出 {"ok":true}' },
      ],
      0,
    );
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
