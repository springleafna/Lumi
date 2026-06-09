import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AiProviderConfigDto,
  AiProviderTestResultDto,
  AiSettingsDto,
  UpdateAiProviderConfigRequest,
} from '@lumi/shared';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

const GLOBAL_AI_SETTING_KEY = 'global';
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

export type RuntimeAiConfig = {
  providerPreset: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  dimension?: number | null;
  fingerprint: string;
};

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getAiSettings(): Promise<AiSettingsDto> {
    const setting = await this.getOrCreateAiSetting();
    return this.toAiSettingsDto(setting);
  }

  async updateChatConfig(input: UpdateAiProviderConfigRequest): Promise<AiSettingsDto> {
    const setting = await this.getOrCreateAiSetting();
    const data = this.normalizeProviderInput(input);
    const encrypted = this.resolveApiKeyUpdate(input.apiKey, {
      cipher: setting.chatApiKeyCipher,
      iv: setting.chatApiKeyIv,
      tag: setting.chatApiKeyTag,
    });

    const updated = await this.prisma.aiSetting.update({
      where: { key: GLOBAL_AI_SETTING_KEY },
      data: {
        chatProviderPreset: data.providerPreset,
        chatBaseUrl: data.baseUrl,
        chatModel: data.model,
        ...(encrypted
          ? {
              chatApiKeyCipher: encrypted.cipher,
              chatApiKeyIv: encrypted.iv,
              chatApiKeyTag: encrypted.tag,
            }
          : {}),
      },
    });
    return this.toAiSettingsDto(updated);
  }

  async updateEmbeddingConfig(input: UpdateAiProviderConfigRequest): Promise<AiSettingsDto> {
    const setting = await this.getOrCreateAiSetting();
    const data = this.normalizeProviderInput(input);
    const encrypted = this.resolveApiKeyUpdate(input.apiKey, {
      cipher: setting.embeddingApiKeyCipher,
      iv: setting.embeddingApiKeyIv,
      tag: setting.embeddingApiKeyTag,
    });

    const updated = await this.prisma.aiSetting.update({
      where: { key: GLOBAL_AI_SETTING_KEY },
      data: {
        embeddingProviderPreset: data.providerPreset,
        embeddingBaseUrl: data.baseUrl,
        embeddingModel: data.model,
        embeddingDimension: null,
        ...(encrypted
          ? {
              embeddingApiKeyCipher: encrypted.cipher,
              embeddingApiKeyIv: encrypted.iv,
              embeddingApiKeyTag: encrypted.tag,
            }
          : {}),
      },
    });
    return this.toAiSettingsDto(updated);
  }

  async clearChatConfig(): Promise<AiSettingsDto> {
    await this.getOrCreateAiSetting();
    const updated = await this.prisma.aiSetting.update({
      where: { key: GLOBAL_AI_SETTING_KEY },
      data: {
        chatProviderPreset: null,
        chatBaseUrl: null,
        chatModel: null,
        chatApiKeyCipher: null,
        chatApiKeyIv: null,
        chatApiKeyTag: null,
        chatLastTestStatus: null,
        chatLastTestError: null,
        chatLastTestedAt: null,
      },
    });
    return this.toAiSettingsDto(updated);
  }

  async clearEmbeddingConfig(): Promise<AiSettingsDto> {
    await this.getOrCreateAiSetting();
    const updated = await this.prisma.aiSetting.update({
      where: { key: GLOBAL_AI_SETTING_KEY },
      data: {
        embeddingProviderPreset: null,
        embeddingBaseUrl: null,
        embeddingModel: null,
        embeddingApiKeyCipher: null,
        embeddingApiKeyIv: null,
        embeddingApiKeyTag: null,
        embeddingDimension: null,
        embeddingLastTestStatus: null,
        embeddingLastTestError: null,
        embeddingLastTestedAt: null,
      },
    });
    return this.toAiSettingsDto(updated);
  }

  async getChatRuntimeConfig(): Promise<RuntimeAiConfig> {
    const setting = await this.getOrCreateAiSetting();
    if (!setting.chatBaseUrl || !setting.chatModel || !setting.chatApiKeyCipher) {
      throw new BadRequestException('请先配置 AI');
    }
    const apiKey = this.decryptApiKey({
      cipher: setting.chatApiKeyCipher,
      iv: setting.chatApiKeyIv,
      tag: setting.chatApiKeyTag,
    });
    return this.toRuntimeConfig({
      providerPreset: setting.chatProviderPreset,
      baseUrl: setting.chatBaseUrl,
      model: setting.chatModel,
      apiKey,
    });
  }

  async getEmbeddingRuntimeConfig(): Promise<RuntimeAiConfig> {
    const setting = await this.getOrCreateAiSetting();
    if (!setting.embeddingBaseUrl || !setting.embeddingModel || !setting.embeddingApiKeyCipher) {
      throw new BadRequestException('Embedding 未配置');
    }
    const apiKey = this.decryptApiKey({
      cipher: setting.embeddingApiKeyCipher,
      iv: setting.embeddingApiKeyIv,
      tag: setting.embeddingApiKeyTag,
    });
    return this.toRuntimeConfig({
      providerPreset: setting.embeddingProviderPreset,
      baseUrl: setting.embeddingBaseUrl,
      model: setting.embeddingModel,
      apiKey,
      dimension: setting.embeddingDimension,
    });
  }

  async testChatConfig(
    tester: (config: RuntimeAiConfig) => Promise<void>,
  ): Promise<AiProviderTestResultDto> {
    const testedAt = new Date();
    try {
      const config = await this.getChatRuntimeConfig();
      await tester(config);
      await this.prisma.aiSetting.update({
        where: { key: GLOBAL_AI_SETTING_KEY },
        data: {
          chatLastTestStatus: 'succeeded',
          chatLastTestError: null,
          chatLastTestedAt: testedAt,
        },
      });
      return { status: 'succeeded', testedAt: testedAt.toISOString(), message: '连接成功' };
    } catch (error) {
      const message = getErrorMessage(error);
      await this.prisma.aiSetting.update({
        where: { key: GLOBAL_AI_SETTING_KEY },
        data: {
          chatLastTestStatus: 'failed',
          chatLastTestError: message,
          chatLastTestedAt: testedAt,
        },
      });
      return { status: 'failed', testedAt: testedAt.toISOString(), message };
    }
  }

  async testEmbeddingConfig(
    tester: (config: RuntimeAiConfig) => Promise<number>,
  ): Promise<AiProviderTestResultDto> {
    const testedAt = new Date();
    try {
      const config = await this.getEmbeddingRuntimeConfig();
      const dimension = await tester(config);
      await this.prisma.aiSetting.update({
        where: { key: GLOBAL_AI_SETTING_KEY },
        data: {
          embeddingDimension: dimension,
          embeddingLastTestStatus: 'succeeded',
          embeddingLastTestError: null,
          embeddingLastTestedAt: testedAt,
        },
      });
      return {
        status: 'succeeded',
        testedAt: testedAt.toISOString(),
        message: '连接成功',
        dimension,
      };
    } catch (error) {
      const message = getErrorMessage(error);
      await this.prisma.aiSetting.update({
        where: { key: GLOBAL_AI_SETTING_KEY },
        data: {
          embeddingLastTestStatus: 'failed',
          embeddingLastTestError: message,
          embeddingLastTestedAt: testedAt,
        },
      });
      return { status: 'failed', testedAt: testedAt.toISOString(), message };
    }
  }

  async updateEmbeddingDimension(dimension: number) {
    await this.getOrCreateAiSetting();
    await this.prisma.aiSetting.update({
      where: { key: GLOBAL_AI_SETTING_KEY },
      data: { embeddingDimension: dimension },
    });
  }

  private async getOrCreateAiSetting() {
    return this.prisma.aiSetting.upsert({
      where: { key: GLOBAL_AI_SETTING_KEY },
      update: {},
      create: { key: GLOBAL_AI_SETTING_KEY },
    });
  }

  private normalizeProviderInput(input: UpdateAiProviderConfigRequest) {
    const baseUrl = input.baseUrl?.trim();
    const model = input.model?.trim();
    if (!baseUrl) throw new BadRequestException('请填写 Base URL');
    if (!model) throw new BadRequestException('请填写模型名称');

    try {
      const url = new URL(baseUrl);
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('invalid protocol');
      }
    } catch {
      throw new BadRequestException('Base URL 格式不正确');
    }

    return {
      providerPreset: input.providerPreset?.trim() || 'custom',
      baseUrl: baseUrl.replace(/\/$/, ''),
      model,
    };
  }

  private resolveApiKeyUpdate(
    apiKey: string | null | undefined,
    existing: { cipher?: string | null; iv?: string | null; tag?: string | null },
  ) {
    if (apiKey === undefined || apiKey === null || apiKey === '') {
      if (!existing.cipher) {
        throw new BadRequestException('请填写 API Key');
      }
      return null;
    }
    return this.encryptApiKey(apiKey);
  }

  private encryptApiKey(apiKey: string) {
    const key = this.getEncryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      cipher: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
    };
  }

  private decryptApiKey(input: {
    cipher?: string | null;
    iv?: string | null;
    tag?: string | null;
  }) {
    if (!input.cipher || !input.iv || !input.tag) {
      throw new BadRequestException('请先配置 AI');
    }
    const key = this.getEncryptionKey();
    const decipher = createDecipheriv(
      ENCRYPTION_ALGORITHM,
      key,
      Buffer.from(input.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(input.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(input.cipher, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  private getEncryptionKey() {
    const raw = this.configService.get<string>('AI_CONFIG_ENCRYPTION_KEY')?.trim();
    if (!raw) {
      throw new BadRequestException('请先配置 AI_CONFIG_ENCRYPTION_KEY');
    }

    if (/^[a-f0-9]{64}$/i.test(raw)) {
      return Buffer.from(raw, 'hex');
    }

    if (raw.length >= 32) {
      return createHash('sha256').update(raw).digest();
    }

    throw new BadRequestException('AI_CONFIG_ENCRYPTION_KEY 长度不足');
  }

  private toRuntimeConfig(input: {
    providerPreset?: string | null;
    baseUrl: string;
    model: string;
    apiKey: string;
    dimension?: number | null;
  }): RuntimeAiConfig {
    const providerPreset = input.providerPreset || 'custom';
    const fingerprint = createHash('sha256')
      .update([providerPreset, input.baseUrl, input.model].join('|'))
      .digest('hex')
      .slice(0, 32);
    return { ...input, providerPreset, fingerprint };
  }

  private toAiSettingsDto(setting: Awaited<ReturnType<typeof this.getOrCreateAiSetting>>): AiSettingsDto {
    return {
      chat: this.toProviderDto({
        providerPreset: setting.chatProviderPreset,
        baseUrl: setting.chatBaseUrl,
        model: setting.chatModel,
        hasApiKey: Boolean(setting.chatApiKeyCipher),
        lastTestStatus: setting.chatLastTestStatus,
        lastTestError: setting.chatLastTestError,
        lastTestedAt: setting.chatLastTestedAt,
      }),
      embedding: this.toProviderDto({
        providerPreset: setting.embeddingProviderPreset,
        baseUrl: setting.embeddingBaseUrl,
        model: setting.embeddingModel,
        hasApiKey: Boolean(setting.embeddingApiKeyCipher),
        dimension: setting.embeddingDimension,
        lastTestStatus: setting.embeddingLastTestStatus,
        lastTestError: setting.embeddingLastTestError,
        lastTestedAt: setting.embeddingLastTestedAt,
      }),
      encryptionReady: Boolean(this.configService.get<string>('AI_CONFIG_ENCRYPTION_KEY')?.trim()),
    };
  }

  private toProviderDto(input: {
    providerPreset?: string | null;
    baseUrl?: string | null;
    model?: string | null;
    hasApiKey: boolean;
    dimension?: number | null;
    lastTestStatus?: 'succeeded' | 'failed' | null;
    lastTestError?: string | null;
    lastTestedAt?: Date | null;
  }): AiProviderConfigDto {
    return {
      configured: Boolean(input.baseUrl && input.model && input.hasApiKey),
      providerPreset: input.providerPreset,
      baseUrl: input.baseUrl,
      model: input.model,
      hasApiKey: input.hasApiKey,
      dimension: input.dimension ?? null,
      lastTestStatus: input.lastTestStatus ?? null,
      lastTestError: input.lastTestError ?? null,
      lastTestedAt: input.lastTestedAt?.toISOString() ?? null,
    };
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return '未知错误';
}
