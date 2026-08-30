import { Module } from '@nestjs/common';
import { PageSchemaController } from './page-schema.controller';
import { PageSchemaService } from './page-schema.service';
import { PageSchemaRepository } from './repositories/page-schema.repository';
import { PageRuntimeMetadataProvider } from './page-runtime-metadata.provider';

@Module({
  controllers: [PageSchemaController],
  providers: [PageSchemaService, PageSchemaRepository, PageRuntimeMetadataProvider],
  exports: [PageSchemaService],
})
export class PageSchemaModule {}
