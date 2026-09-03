import { Injectable } from '@nestjs/common';
import { ComponentMetaRegistry } from '../schema-context/component-metadata/component-meta.registry';
import { CollectionTargetResolverService } from '../schema-context/collection-target-resolver.service';
import { ContextAssemblerService } from '../schema-context/context-assembler.service';
import { PatchAutoFixService } from './patch-auto-fix.service';
import { PatchValidationService } from './patch-validation.service';
import { ToolDefinition, ToolVisibility } from './types/tool.types';
import { createInternalDefinitions } from './definitions/internal.tools';
import { createReadDefinitions } from './definitions/read.tools';
import { createWriteDefinitions } from './definitions/write.tools';

/** Increment whenever exposed production tool names, schemas, or semantics change. */
export const AGENT_TOOL_REGISTRY_VERSION = 'agent-tool-registry-v1';

/**
 * ToolRegistryService — thin facade.
 *
 * Definitions live in definitions/* and coercion in tool-input.coerce.ts.
 * This file only assembles and exposes the registry.
 */
@Injectable()
export class ToolRegistryService {
  private readonly tools = new Map<string, ToolDefinition>();

  constructor(
    private readonly contextAssembler: ContextAssemblerService,
    private readonly metaRegistry: ComponentMetaRegistry,
    private readonly collectionTargetResolver: CollectionTargetResolverService,
    private readonly patchAutoFixService: PatchAutoFixService,
    private readonly patchValidationService: PatchValidationService,
  ) {
    this.registerTools();
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): string[] {
    return Array.from(this.tools.keys());
  }

  listDefinitions(visibility?: ToolVisibility): ToolDefinition[] {
    const definitions = Array.from(this.tools.values());
    if (!visibility) return definitions;
    return definitions.filter((definition) => definition.visibility === visibility);
  }

  private registerTools() {
    const definitions: ToolDefinition[] = [
      ...createReadDefinitions({
        contextAssembler: this.contextAssembler,
        metaRegistry: this.metaRegistry,
        collectionTargetResolver: this.collectionTargetResolver,
      }),
      ...createWriteDefinitions({
        patchValidationService: this.patchValidationService,
      }),
      ...createInternalDefinitions({
        patchAutoFixService: this.patchAutoFixService,
        patchValidationService: this.patchValidationService,
      }),
    ];

    for (const definition of definitions) {
      this.tools.set(definition.name, definition);
    }
  }
}
