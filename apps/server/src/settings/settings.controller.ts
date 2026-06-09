import { Body, Controller, Delete, Get, Post, Put, UseGuards } from '@nestjs/common';
import type { UpdateAiProviderConfigRequest } from '@lumi/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiProviderService } from '../ai/ai-provider.service';
import { SettingsService } from './settings.service';

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly aiProviderService: AiProviderService,
  ) {}

  @Get('ai')
  getAiSettings() {
    return this.settingsService.getAiSettings();
  }

  @Put('ai/chat')
  updateChatConfig(@Body() body: UpdateAiProviderConfigRequest) {
    return this.settingsService.updateChatConfig(body);
  }

  @Put('ai/embedding')
  updateEmbeddingConfig(@Body() body: UpdateAiProviderConfigRequest) {
    return this.settingsService.updateEmbeddingConfig(body);
  }

  @Delete('ai/chat')
  clearChatConfig() {
    return this.settingsService.clearChatConfig();
  }

  @Delete('ai/embedding')
  clearEmbeddingConfig() {
    return this.settingsService.clearEmbeddingConfig();
  }

  @Post('ai/chat/test')
  testChatConfig() {
    return this.settingsService.testChatConfig((config) =>
      this.aiProviderService.testChatConfig(config),
    );
  }

  @Post('ai/embedding/test')
  testEmbeddingConfig() {
    return this.settingsService.testEmbeddingConfig((config) =>
      this.aiProviderService.testEmbeddingConfig(config),
    );
  }
}
