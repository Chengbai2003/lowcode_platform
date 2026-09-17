import { Injectable, Optional } from '@nestjs/common';
import type { RuntimeCompatibility } from '@lowcode-platform/schema-contract';
import { ANTD_RUNTIME_COMPATIBILITY } from '@lowcode-platform/preset-antd';
import { SchemaResolverService } from './schema-resolver.service';
import { NodeLocatorService } from './node-locator.service';
import { SchemaSlicerService } from './schema-slicer.service';
import { ComponentMetaRegistry } from './component-metadata/component-meta.registry';
import { FocusContextResult } from './types/focus-context.types';
import { SliceOptions } from './types/slice-options.types';
import {
  DEPLOYMENT_RUNTIME_PROFILE_REGISTRY,
  DeploymentRuntimeProfileRegistry,
} from '../runtime-profile/deployment-runtime-profile-registry';

@Injectable()
export class ContextAssemblerService {
  private readonly deploymentRegistry: DeploymentRuntimeProfileRegistry;

  constructor(
    private readonly schemaResolver: SchemaResolverService,
    private readonly nodeLocator: NodeLocatorService,
    private readonly schemaSlicer: SchemaSlicerService,
    private readonly metaRegistry: ComponentMetaRegistry,
    @Optional() deploymentRegistry?: DeploymentRuntimeProfileRegistry,
  ) {
    this.deploymentRegistry = deploymentRegistry ?? DEPLOYMENT_RUNTIME_PROFILE_REGISTRY;
  }

  async assemble(input: {
    pageId?: string;
    pageVersion?: number;
    draftSchema?: Record<string, unknown>;
    selectedId?: string;
    instruction?: string;
    sliceOptions?: Partial<SliceOptions>;
    runtimeCompatibility?: RuntimeCompatibility;
  }): Promise<FocusContextResult> {
    let schema;
    let compatibility = input.runtimeCompatibility ?? ANTD_RUNTIME_COMPATIBILITY;

    if (typeof this.schemaResolver.resolveWithCompatibility === 'function') {
      const resolved = await this.schemaResolver.resolveWithCompatibility({
        pageId: input.pageId,
        pageVersion: input.pageVersion,
        draftSchema: input.draftSchema,
      });
      schema = resolved.schema;
      compatibility = input.runtimeCompatibility ?? resolved.runtimeCompatibility;
    } else {
      schema = await this.schemaResolver.resolve({
        pageId: input.pageId,
        pageVersion: input.pageVersion,
        draftSchema: input.draftSchema,
      });
    }

    const locatorResult = this.nodeLocator.locate(schema, input.selectedId, input.instruction);

    const metaRegistry = compatibility
      ? this.deploymentRegistry.resolveComponentMeta(compatibility)
      : this.metaRegistry;
    const componentList = metaRegistry.getAllTypeNames();

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
