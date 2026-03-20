import { Module } from '@nestjs/common';
import { PageSchemaModule } from '../page-schema/page-schema.module';
import { ComponentMetaRegistry } from './component-metadata/component-meta.registry';
import { SchemaResolverService } from './schema-resolver.service';
import { SchemaSlicerService } from './schema-slicer.service';
import { NodeLocatorService } from './node-locator.service';
import { ContextAssemblerService } from './context-assembler.service';

@Module({
  imports: [PageSchemaModule],
  providers: [
    ComponentMetaRegistry,
    SchemaResolverService,
    SchemaSlicerService,
    NodeLocatorService,
    ContextAssemblerService,
  ],
  exports: [ContextAssemblerService, SchemaResolverService, ComponentMetaRegistry],
})
export class SchemaContextModule {}
