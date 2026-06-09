import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { DocumentEmbeddingStatus, UserDto } from '@lumi/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EmbeddingsService } from './embeddings.service';

@Controller('settings/embedding-jobs')
@UseGuards(JwtAuthGuard)
export class EmbeddingsController {
  constructor(private readonly embeddingsService: EmbeddingsService) {}

  @Get()
  listJobs(
    @CurrentUser() user: UserDto,
    @Query('status') status?: DocumentEmbeddingStatus,
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.embeddingsService.listJobs(user.id, {
      status,
      keyword,
      page: Number(page) || 1,
      pageSize: Number(pageSize) || 20,
    });
  }

  @Get(':id/chunks')
  getJobChunks(@CurrentUser() user: UserDto, @Param('id') id: string) {
    return this.embeddingsService.getJobChunks(user.id, id);
  }

  @Post(':id/retry')
  retryJob(@CurrentUser() user: UserDto, @Param('id') id: string) {
    return this.embeddingsService.retryJob(user.id, id);
  }
}
