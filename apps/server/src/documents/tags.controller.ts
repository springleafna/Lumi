import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { MergeTagRequest, RenameTagRequest, UserDto } from '@lumi/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DocumentsService } from './documents.service';

@Controller('tags')
@UseGuards(JwtAuthGuard)
export class TagsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Patch(':id')
  rename(
    @CurrentUser() user: UserDto,
    @Param('id') id: string,
    @Body() body: RenameTagRequest,
  ) {
    return this.documentsService.renameTag(user.id, id, body.name);
  }

  @Post(':id/merge')
  merge(
    @CurrentUser() user: UserDto,
    @Param('id') id: string,
    @Body() body: MergeTagRequest,
  ) {
    return this.documentsService.mergeTag(user.id, id, body.targetId);
  }

  @Delete(':id')
  remove(@CurrentUser() user: UserDto, @Param('id') id: string) {
    return this.documentsService.deleteTag(user.id, id);
  }
}
