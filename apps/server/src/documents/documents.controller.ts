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
  DocumentSort,
  DocumentStatus,
  DocumentType,
  UserDto,
} from '@lumi/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DocumentsService } from './documents.service';

@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  list(
    @CurrentUser() user: UserDto,
    @Query('keyword') keyword?: string,
    @Query('status') status?: DocumentStatus,
    @Query('type') type?: DocumentType,
    @Query('tag') tag?: string,
    @Query('source') source?: string,
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

  @Post(':id/tags')
  addTag(
    @CurrentUser() user: UserDto,
    @Param('id') id: string,
    @Body() body: AddDocumentTagRequest,
  ) {
    return this.documentsService.addTag(user.id, id, body.name);
  }

  @Delete(':id/tags/:tagId')
  removeTag(
    @CurrentUser() user: UserDto,
    @Param('id') id: string,
    @Param('tagId') tagId: string,
  ) {
    return this.documentsService.removeTag(user.id, id, tagId);
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
