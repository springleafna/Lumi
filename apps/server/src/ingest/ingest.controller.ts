import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import type { IngestHtmlRequest, IngestUrlRequest, UserDto } from '@lumi/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IngestService } from './ingest.service';

@Controller('ingest')
@UseGuards(JwtAuthGuard)
export class IngestController {
  constructor(private readonly ingestService: IngestService) {}

  @Post('url')
  ingestUrl(@CurrentUser() user: UserDto, @Body() body: IngestUrlRequest) {
    return this.ingestService.ingestUrl(user.id, body);
  }

  @Post('html')
  ingestHtml(@CurrentUser() user: UserDto, @Body() body: IngestHtmlRequest) {
    return this.ingestService.ingestHtml(user.id, body);
  }
}
