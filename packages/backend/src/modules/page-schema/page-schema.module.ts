import { Module } from '@nestjs/common';
import { PageSchemaController } from './page-schema.controller';
import { PageSchemaService } from './page-schema.service';
import { PageSchemaRepository } from './repositories/page-schema.repository';

@Module({
  controllers: [PageSchemaController],
  providers: [PageSchemaService, PageSchemaRepository],
  exports: [PageSchemaService],
})
export class PageSchemaModule {}
