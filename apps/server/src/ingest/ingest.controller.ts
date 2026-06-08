import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type {
  IngestHtmlRequest,
  IngestSelectionRequest,
  IngestUrlRequest,
  UserDto,
} from '@lumi/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  IngestService,
  MAX_FILE_BYTES,
  type UploadedTextFile,
} from './ingest.service';

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

  @Post('file')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES } }))
  ingestFile(
    @CurrentUser() user: UserDto,
    @UploadedFile() file?: UploadedTextFile,
  ) {
    return this.ingestService.ingestFile(user.id, file);
  }

  @Post('selection')
  ingestSelection(
    @CurrentUser() user: UserDto,
    @Body() body: IngestSelectionRequest,
  ) {
    return this.ingestService.ingestSelection(user.id, body);
  }
}
