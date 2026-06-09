import { Body, Controller, Delete, Get, Param, Patch, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type {
  CreateKnowledgeChatRequest,
  UpdateKnowledgeChatSessionRequest,
  UserDto,
} from '@lumi/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { KnowledgeChatService } from './knowledge-chat.service';

@Controller('knowledge-chat')
@UseGuards(JwtAuthGuard)
export class KnowledgeChatController {
  constructor(private readonly knowledgeChatService: KnowledgeChatService) {}

  @Get('sessions')
  listSessions(@CurrentUser() user: UserDto) {
    return this.knowledgeChatService.listSessions(user.id);
  }

  @Post('sessions/ask')
  askNewSession(
    @CurrentUser() user: UserDto,
    @Body() body: CreateKnowledgeChatRequest,
    @Res() response: Response,
  ) {
    return this.knowledgeChatService.askNewSession(user.id, body, response);
  }

  @Get('sessions/:id')
  getSession(@CurrentUser() user: UserDto, @Param('id') id: string) {
    return this.knowledgeChatService.getSession(user.id, id);
  }

  @Patch('sessions/:id')
  updateSession(
    @CurrentUser() user: UserDto,
    @Param('id') id: string,
    @Body() body: UpdateKnowledgeChatSessionRequest,
  ) {
    return this.knowledgeChatService.updateSession(user.id, id, body);
  }

  @Delete('sessions/:id')
  deleteSession(@CurrentUser() user: UserDto, @Param('id') id: string) {
    return this.knowledgeChatService.deleteSession(user.id, id);
  }

  @Post('sessions/:id/messages')
  askInSession(
    @CurrentUser() user: UserDto,
    @Param('id') id: string,
    @Body() body: CreateKnowledgeChatRequest,
    @Res() response: Response,
  ) {
    return this.knowledgeChatService.askInSession(user.id, id, body, response);
  }

  @Post('messages/:messageId/regenerate')
  regenerate(
    @CurrentUser() user: UserDto,
    @Param('messageId') messageId: string,
    @Res() response: Response,
  ) {
    return this.knowledgeChatService.regenerate(user.id, messageId, response);
  }
}
