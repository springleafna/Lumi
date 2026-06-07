import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { CreateAiConversationRequest, UserDto } from '@lumi/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiService } from './ai.service';

@Controller('documents/:id')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('ai-analysis')
  getAnalysis(@CurrentUser() user: UserDto, @Param('id') id: string) {
    return this.aiService.getAnalysis(user.id, id);
  }

  @Post('ai-analysis/retry')
  retryAnalysis(@CurrentUser() user: UserDto, @Param('id') id: string) {
    return this.aiService.retryAnalysis(user.id, id);
  }

  @Get('ai-conversations')
  listConversations(@CurrentUser() user: UserDto, @Param('id') id: string) {
    return this.aiService.listConversations(user.id, id);
  }

  @Post('ai-conversations')
  async createConversation(
    @CurrentUser() user: UserDto,
    @Param('id') id: string,
    @Body() body: CreateAiConversationRequest,
    @Res() response: Response,
  ) {
    await this.aiService.streamConversation(user.id, id, body, response);
  }
}
