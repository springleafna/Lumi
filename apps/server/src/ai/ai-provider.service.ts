import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type AiProviderConfig = {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
};

@Injectable()
export class AiProviderService {
  constructor(private readonly configService: ConfigService) {}

  getConfig(): AiProviderConfig {
    const provider = (this.configService.get<string>('AI_PROVIDER') || 'deepseek').toLowerCase();
    if (provider === 'siliconflow') {
      return this.buildConfig({
        provider,
        apiKey: 'SILICONFLOW_API_KEY',
        baseUrl: 'SILICONFLOW_BASE_URL',
        model: 'SILICONFLOW_MODEL',
        fallbackBaseUrl: 'https://api.siliconflow.cn/v1',
      });
    }

    return this.buildConfig({
      provider: 'deepseek',
      apiKey: 'DEEPSEEK_API_KEY',
      baseUrl: 'DEEPSEEK_BASE_URL',
      model: 'DEEPSEEK_MODEL',
      fallbackBaseUrl: 'https://api.deepseek.com',
      fallbackModel: 'deepseek-chat',
    });
  }

  async chatJson(messages: ChatMessage[], temperature = 0.2): Promise<string> {
    const config = this.getConfig();
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

  async *streamChat(messages: ChatMessage[], temperature = 0.2): AsyncIterable<string> {
    const config = this.getConfig();
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

  private buildConfig(input: {
    provider: string;
    apiKey: string;
    baseUrl: string;
    model: string;
    fallbackBaseUrl: string;
    fallbackModel?: string;
  }): AiProviderConfig {
    const apiKey = this.configService.get<string>(input.apiKey);
    const model = this.configService.get<string>(input.model) || input.fallbackModel;
    if (!apiKey) {
      throw new BadRequestException(`请先配置 ${input.apiKey}`);
    }
    if (!model) {
      throw new BadRequestException(`请先配置 ${input.model}`);
    }

    return {
      provider: input.provider,
      apiKey,
      model,
      baseUrl: this.configService.get<string>(input.baseUrl) || input.fallbackBaseUrl,
    };
  }
}

async function readResponseText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}
