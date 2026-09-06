import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  AddDocumentTagRequest,
  CreateAnnotationRequest,
  DocumentSort,
  DocumentStatus,
  DocumentType,
  DocumentReadingStatus,
  UpdateAnnotationRequest,
  UpdateFavoriteRequest,
  UpdateReadingStatusRequest,
  UserDto,
} from '@lumi/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IngestService } from '../ingest/ingest.service';
import { DocumentsService } from './documents.service';

@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly ingestService: IngestService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: UserDto,
    @Query('keyword') keyword?: string,
    @Query('status') status?: DocumentStatus,
    @Query('type') type?: DocumentType,
    @Query('tag') tag?: string,
    @Query('source') source?: string,
    @Query('readingStatus') readingStatus?: DocumentReadingStatus,
    @Query('favorite') favorite?: string,
    @Query('sort') sort?: DocumentSort,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.documentsService.list(user.id, {
      keyword,
      status,
      type,
      tag,
      source,
      readingStatus,
      favorite: favorite === 'true' ? true : undefined,
      sort,
      page: Number(page) || 1,
      pageSize: Number(pageSize) || 20,
    });
  }

  @Get('facets')
  facets(@CurrentUser() user: UserDto) {
    return this.documentsService.facets(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: UserDto, @Param('id') id: string) {
    return this.documentsService.get(user.id, id);
  }

  @Get(':id/transcript')
  getTranscript(@CurrentUser() user: UserDto, @Param('id') id: string) {
    return this.documentsService.getTranscript(user.id, id);
  }

  @Patch(':id/archive')
  archive(@CurrentUser() user: UserDto, @Param('id') id: string) {
    return this.documentsService.archive(user.id, id);
  }

  @Patch(':id/unarchive')
  unarchive(@CurrentUser() user: UserDto, @Param('id') id: string) {
    return this.documentsService.unarchive(user.id, id);
  }

  @Patch(':id/restore')
  restore(@CurrentUser() user: UserDto, @Param('id') id: string) {
    return this.documentsService.restore(user.id, id);
  }

  @Patch(':id/reading-status')
  updateReadingStatus(
    @CurrentUser() user: UserDto,
    @Param('id') id: string,
    @Body() body: UpdateReadingStatusRequest,
  ) {
    return this.documentsService.updateReadingStatus(user.id, id, body.readingStatus);
  }

  @Patch(':id/favorite')
  updateFavorite(
    @CurrentUser() user: UserDto,
    @Param('id') id: string,
    @Body() body: UpdateFavoriteRequest,
  ) {
    return this.documentsService.updateFavorite(user.id, id, Boolean(body.favorite));
  }

  @Post(':id/tags')
  addTag(
    @CurrentUser() user: UserDto,
    @Param('id') id: string,
    @Body() body: AddDocumentTagRequest,
  ) {
    return this.documentsService.addTag(user.id, id, body.name);
  }

  @Post(':id/retry-ingest')
  retryIngest(@CurrentUser() user: UserDto, @Param('id') id: string) {
    return this.ingestService.retryDocumentIngest(user.id, id);
  }

  @Delete(':id/tags/:tagId')
  removeTag(
    @CurrentUser() user: UserDto,
    @Param('id') id: string,
    @Param('tagId') tagId: string,
  ) {
    return this.documentsService.removeTag(user.id, id, tagId);
  }

  @Get(':id/annotations')
  listAnnotations(@CurrentUser() user: UserDto, @Param('id') id: string) {
    return this.documentsService.listAnnotations(user.id, id);
  }

  @Post(':id/annotations')
  createAnnotation(
    @CurrentUser() user: UserDto,
    @Param('id') id: string,
    @Body() body: CreateAnnotationRequest,
  ) {
    return this.documentsService.createAnnotation(user.id, id, body);
  }

  @Patch(':id/annotations/:annotationId')
  updateAnnotation(
    @CurrentUser() user: UserDto,
    @Param('id') id: string,
    @Param('annotationId') annotationId: string,
    @Body() body: UpdateAnnotationRequest,
  ) {
    return this.documentsService.updateAnnotation(user.id, id, annotationId, body);
  }

  @Delete(':id/annotations/:annotationId')
  deleteAnnotation(
    @CurrentUser() user: UserDto,
    @Param('id') id: string,
    @Param('annotationId') annotationId: string,
  ) {
    return this.documentsService.deleteAnnotation(user.id, id, annotationId);
  }

  @Delete(':id')
  delete(@CurrentUser() user: UserDto, @Param('id') id: string) {
    return this.documentsService.softDelete(user.id, id);
  }

  @Delete(':id/permanent')
  permanentDelete(@CurrentUser() user: UserDto, @Param('id') id: string) {
    return this.documentsService.permanentDelete(user.id, id);
  }
}
