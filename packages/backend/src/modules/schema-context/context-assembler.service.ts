import { Injectable } from '@nestjs/common';
import { SchemaResolverService } from './schema-resolver.service';
import { NodeLocatorService } from './node-locator.service';
import { SchemaSlicerService } from './schema-slicer.service';
import { ComponentMetaRegistry } from './component-metadata/component-meta.registry';
import { FocusContextResult } from './types/focus-context.types';
import { SliceOptions } from './types/slice-options.types';

@Injectable()
export class ContextAssemblerService {
  constructor(
    private readonly schemaResolver: SchemaResolverService,
    private readonly nodeLocator: NodeLocatorService,
    private readonly schemaSlicer: SchemaSlicerService,
    private readonly metaRegistry: ComponentMetaRegistry,
  ) {}

  async assemble(input: {
    pageId?: string;
    version?: number;
    draftSchema?: Record<string, unknown>;
    selectedId?: string;
    instruction?: string;
    sliceOptions?: Partial<SliceOptions>;
  }): Promise<FocusContextResult> {
    const schema = await this.schemaResolver.resolve({
      pageId: input.pageId,
      version: input.version,
      draftSchema: input.draftSchema,
    });

    const locatorResult = this.nodeLocator.locate(schema, input.selectedId, input.instruction);

    const componentList = this.metaRegistry.getAllTypeNames();

    if (locatorResult.mode === 'exact' && locatorResult.targetId) {
      const context = this.schemaSlicer.slice(schema, locatorResult.targetId, input.sliceOptions);
      return {
        mode: 'focused',
        context,
        schema,
        componentList,
      };
    }

    return {
      mode: 'candidates',
      candidates: locatorResult.candidates,
      schema,
      componentList,
    };
  }
}
