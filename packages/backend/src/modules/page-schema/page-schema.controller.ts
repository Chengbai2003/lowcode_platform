import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { GetPageSchemaDto } from './dto/get-page-schema.dto';
import { SavePageSchemaDto } from './dto/save-page-schema.dto';
import { PageSchemaService } from './page-schema.service';

@Controller('pages')
@UseGuards(AuthGuard)
export class PageSchemaController {
  constructor(private readonly pageSchemaService: PageSchemaService) {}

  @Put(':pageId/schema')
  async saveSchema(@Param('pageId') pageId: string, @Body() dto: SavePageSchemaDto) {
    return this.pageSchemaService.saveSchema(pageId, dto);
  }

  @Get(':pageId/schema')
  async getSchema(@Param('pageId') pageId: string, @Query() query: GetPageSchemaDto) {
    return this.pageSchemaService.getSchema(pageId, query.version);
  }
}
