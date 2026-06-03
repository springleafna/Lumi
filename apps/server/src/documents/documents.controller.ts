import {
  Controller,
  Delete,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { UserDto } from '@lumi/shared';
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
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.documentsService.list(user.id, {
      keyword,
      page: Number(page) || 1,
      pageSize: Number(pageSize) || 20,
    });
  }

  @Get(':id')
  get(@CurrentUser() user: UserDto, @Param('id') id: string) {
    return this.documentsService.get(user.id, id);
  }

  @Delete(':id')
  delete(@CurrentUser() user: UserDto, @Param('id') id: string) {
    return this.documentsService.softDelete(user.id, id);
  }
}
