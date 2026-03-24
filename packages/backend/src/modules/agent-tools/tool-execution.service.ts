import { Injectable, NotFoundException } from '@nestjs/common';
import { ContextAssemblerService } from '../schema-context';
import { A2UISchema } from '../schema-context/types/schema.types';
import { PageSchemaService } from '../page-schema/page-schema.service';
import { assertValidPageSchema } from '../page-schema/schema-validation';
import { AgentToolException } from './agent-tool.exception';
import { PatchPreviewRequestDto } from './dto/patch-preview-request.dto';
import { PatchPreviewResponseDto } from './dto/patch-preview-response.dto';
import { EditorAction, EditorActionList } from './types/editor-action.types';
import { ToolExecutionContext, ToolExecutionResult } from './types/tool.types';
import { EditorPatchOperation } from './types/editor-patch.types';
import { ToolRegistryService } from './tool-registry.service';

@Injectable()
export class ToolExecutionService {
  constructor(
    private readonly pageSchemaService: PageSchemaService,
    private readonly contextAssembler: ContextAssemblerService,
    private readonly toolRegistry: ToolRegistryService,
  ) {}

  async previewPatch(
    request: PatchPreviewRequestDto,
    traceId: string,
  ): Promise<PatchPreviewResponseDto> {
    const context = await this.createExecutionContext(
      {
        pageId: request.pageId,
        version: request.version,
        draftSchema: request.draftSchema,
      },
      traceId,
    );

    let patch = this.normalizePatchOperations(request.patch);

    if (request.autoFix) {
      const autoFixResult = await this.executeTool('auto_fix_patch', { patch }, context);
      patch = (autoFixResult.data as { patch: EditorPatchOperation[] }).patch;
    }

    const previewResult = await this.executeTool('preview_patch', { patch }, context);
    const previewPatch = (
      (previewResult.data as { patch?: EditorPatchOperation[] })?.patch ?? patch
    ).map((operation) => ({ ...operation }));

    return {
      pageId: context.pageId,
      baseVersion: request.version ?? context.resolvedVersion,
      resolvedVersion: context.resolvedVersion,
      patch: previewPatch,
      schema: context.workingSchema,
      warnings: [...context.warnings],
      traceId: context.traceId,
    };
  }

  async executeTool(
    name: string,
    input: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const tool = this.toolRegistry.get(name);

    if (!tool) {
      throw new AgentToolException({
        code: 'PATCH_INVALID',
        message: `Unknown tool ${name}`,
        traceId: context.traceId,
      });
    }

    const result = await tool.execute(input, context);

    if (result.patchDelta?.length) {
      context.accumulatedPatch = [...context.accumulatedPatch, ...result.patchDelta];
    }

    if (result.updatedWorkingSchema) {
      context.workingSchema = result.updatedWorkingSchema;
    }

    if (result.warnings?.length) {
      context.warnings.push(...result.warnings);
    }

    return result;
  }

  async createExecutionContext(
    input: {
      pageId?: string;
      version?: number;
      draftSchema?: Record<string, unknown>;
    },
    traceId: string,
  ): Promise<ToolExecutionContext> {
    let pageId = input.pageId;
    let resolvedVersion = input.version;
    let workingSchema: A2UISchema | undefined;

    if (pageId) {
      try {
        const latestPage = await this.pageSchemaService.getSchema(pageId);
        resolvedVersion = latestPage.version;

        if (input.version !== undefined && input.version !== latestPage.version) {
          throw new AgentToolException({
            code: 'PAGE_VERSION_CONFLICT',
            message: 'Page version mismatch',
            traceId,
            details: {
              pageId,
              expectedVersion: latestPage.version,
              receivedVersion: input.version,
            },
          });
        }

        if (!input.draftSchema) {
          workingSchema = latestPage.schema as unknown as A2UISchema;
        }
      } catch (error) {
        if (error instanceof AgentToolException) {
          throw error;
        }
        if (error instanceof NotFoundException) {
          throw new AgentToolException({
            code: 'PAGE_NOT_FOUND',
            message: `Page ${pageId} not found`,
            traceId,
            details: { pageId },
          });
        }
        throw error;
      }
    }

    if (input.draftSchema) {
      try {
        assertValidPageSchema(input.draftSchema);
      } catch (error) {
        throw new AgentToolException({
          code: 'SCHEMA_INVALID',
          message: error instanceof Error ? error.message : 'Draft schema is invalid',
          traceId,
        });
      }

      const draftSchema = input.draftSchema as unknown as A2UISchema;
      workingSchema = {
        ...draftSchema,
        version: resolvedVersion ?? draftSchema.version,
      };
    }

    if (!workingSchema) {
      throw new AgentToolException({
        code: 'PATCH_INVALID',
        message: 'Either pageId or draftSchema must be provided',
        traceId,
      });
    }

    return {
      pageId,
      version: input.version,
      resolvedVersion,
      draftSchema: workingSchema,
      workingSchema,
      accumulatedPatch: [],
      warnings: [],
      traceId,
    };
  }

  async getFocusContext(context: ToolExecutionContext, selectedId?: string, instruction?: string) {
    return this.contextAssembler.assemble({
      draftSchema: context.workingSchema as unknown as Record<string, unknown>,
      selectedId,
      instruction,
    });
  }

  private normalizePatchOperations(
    patch: Array<{
      op: string;
      parentId?: string;
      index?: number;
      component?: Record<string, unknown>;
      componentId?: string;
      props?: Record<string, unknown>;
      event?: string;
      actions?: Array<Record<string, unknown>>;
      newParentId?: string;
      newIndex?: number;
    }>,
  ): EditorPatchOperation[] {
    return patch.map<EditorPatchOperation>((operation) => {
      switch (operation.op) {
        case 'insertComponent':
          return {
            op: 'insertComponent',
            parentId: operation.parentId ?? '',
            index: operation.index,
            component: operation.component ?? {},
          };
        case 'updateProps':
          return {
            op: 'updateProps',
            componentId: operation.componentId ?? '',
            props: operation.props ?? {},
          };
        case 'bindEvent':
          return {
            op: 'bindEvent',
            componentId: operation.componentId ?? '',
            event: operation.event ?? '',
            actions: this.normalizeActionList(operation.actions),
          };
        case 'removeComponent':
          return {
            op: 'removeComponent',
            componentId: operation.componentId ?? '',
          };
        case 'moveComponent':
          return {
            op: 'moveComponent',
            componentId: operation.componentId ?? '',
            newParentId: operation.newParentId ?? '',
            newIndex: operation.newIndex ?? -1,
          };
        default:
          throw new AgentToolException({
            code: 'PATCH_INVALID',
            message: `Unsupported patch operation ${operation.op}`,
            traceId: 'patch-normalizer',
          });
      }
    });
  }

  private normalizeActionList(actions?: Array<Record<string, unknown>>): EditorActionList {
    if (!Array.isArray(actions)) {
      return [];
    }

    return actions.map(
      (action) =>
        ({
          ...(action ?? {}),
          type: typeof action?.type === 'string' ? action.type : '',
        }) as EditorAction,
    );
  }
}
