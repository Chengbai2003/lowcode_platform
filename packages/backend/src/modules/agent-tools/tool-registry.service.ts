import { Injectable } from '@nestjs/common';
import { ComponentMetaRegistry } from '../schema-context/component-metadata/component-meta.registry';
import { ContextAssemblerService } from '../schema-context/context-assembler.service';
import { PageSchemaService } from '../page-schema/page-schema.service';
import { PatchApplyService } from './patch-apply.service';
import { PatchAutoFixService } from './patch-auto-fix.service';
import { PatchValidationService } from './patch-validation.service';
import { EditorAction, EditorActionList } from './types/editor-action.types';
import { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from './types/tool.types';
import { EditorPatchOperation } from './types/editor-patch.types';

@Injectable()
export class ToolRegistryService {
  private readonly tools = new Map<string, ToolDefinition>();

  constructor(
    private readonly pageSchemaService: PageSchemaService,
    private readonly contextAssembler: ContextAssemblerService,
    private readonly metaRegistry: ComponentMetaRegistry,
    private readonly patchApplyService: PatchApplyService,
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

  private registerTools() {
    const definitions: ToolDefinition[] = [
      {
        name: 'get_page_schema',
        execute: async (_input, context) => ({
          data: context.workingSchema,
        }),
      },
      {
        name: 'get_focus_context',
        execute: async (input, context) => ({
          data: await this.contextAssembler.assemble({
            draftSchema: context.workingSchema as unknown as Record<string, unknown>,
            selectedId: this.asOptionalString(input.selectedId),
            instruction: this.asOptionalString(input.instruction),
          }),
        }),
      },
      {
        name: 'find_node_candidates',
        execute: async (input, context) => ({
          data: await this.contextAssembler.assemble({
            draftSchema: context.workingSchema as unknown as Record<string, unknown>,
            selectedId: this.asOptionalString(input.selectedId),
            instruction: this.asOptionalString(input.instruction),
          }),
        }),
      },
      {
        name: 'get_component_meta',
        execute: async (input) => {
          const type = this.asOptionalString(input.type);
          if (type) {
            return {
              data: {
                component: this.metaRegistry.resolve(type),
              },
            };
          }

          return {
            data: {
              components: this.metaRegistry.getAll(),
            },
          };
        },
      },
      {
        name: 'insert_component',
        execute: async (input, context) =>
          this.executeWriteTool(
            context,
            {
              op: 'insertComponent',
              parentId: this.asRequiredString(input.parentId),
              index: this.asOptionalNumber(input.index),
              component: this.asRecord(input.component),
            },
            'insert_component',
          ),
      },
      {
        name: 'update_component_props',
        execute: async (input, context) =>
          this.executeWriteTool(
            context,
            {
              op: 'updateProps',
              componentId: this.asRequiredString(input.componentId),
              props: this.asRecord(input.props),
            },
            'update_component_props',
          ),
      },
      {
        name: 'bind_event',
        execute: async (input, context) =>
          this.executeWriteTool(
            context,
            {
              op: 'bindEvent',
              componentId: this.asRequiredString(input.componentId),
              event: this.asRequiredString(input.event),
              actions: this.asActionList(input.actions),
            },
            'bind_event',
          ),
      },
      {
        name: 'remove_component',
        execute: async (input, context) =>
          this.executeWriteTool(
            context,
            {
              op: 'removeComponent',
              componentId: this.asRequiredString(input.componentId),
            },
            'remove_component',
          ),
      },
      {
        name: 'move_component',
        execute: async (input, context) =>
          this.executeWriteTool(
            context,
            {
              op: 'moveComponent',
              componentId: this.asRequiredString(input.componentId),
              newParentId: this.asRequiredString(input.newParentId),
              newIndex: this.asRequiredNumber(input.newIndex),
            },
            'move_component',
          ),
      },
      {
        name: 'validate_patch',
        execute: async (input, context) => {
          const patch = this.asPatchArray(input.patch);
          this.patchValidationService.validatePatchShape(patch, context.traceId);
          this.patchValidationService.previewValidatedSchema(
            context.workingSchema,
            patch,
            context.traceId,
          );
          return {
            data: { valid: true },
          };
        },
      },
      {
        name: 'auto_fix_patch',
        execute: async (input) => {
          const patch = this.asPatchArray(input.patch);
          const result = this.patchAutoFixService.autoFix(patch);
          return {
            data: { patch: result.patch },
            warnings: result.warnings,
          };
        },
      },
      {
        name: 'preview_patch',
        execute: async (input, context) => {
          const patch = this.asPatchArray(input.patch);
          this.patchValidationService.validatePatchShape(patch, context.traceId);
          const nextSchema = this.patchValidationService.previewValidatedSchema(
            context.workingSchema,
            patch,
            context.traceId,
          );
          return {
            data: { patch },
            updatedWorkingSchema: nextSchema,
          };
        },
      },
    ];

    for (const definition of definitions) {
      this.tools.set(definition.name, definition);
    }
  }

  private executeWriteTool(
    context: ToolExecutionContext,
    operation: EditorPatchOperation,
    _toolName: string,
  ): ToolExecutionResult {
    this.patchValidationService.validatePatchShape([operation], context.traceId);
    const nextSchema = this.patchValidationService.previewValidatedSchema(
      context.workingSchema,
      [operation],
      context.traceId,
    );

    return {
      patchDelta: [operation],
      updatedWorkingSchema: nextSchema,
    };
  }

  private asOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
  }

  private asRequiredString(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private asOptionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
  }

  private asRequiredNumber(value: unknown): number {
    return typeof value === 'number' ? value : -1;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private asActionList(value: unknown): EditorActionList {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item),
      )
      .map(
        (item) =>
          ({
            ...item,
            type: typeof item.type === 'string' ? item.type : '',
          }) as EditorAction,
      );
  }

  private asPatchArray(value: unknown): EditorPatchOperation[] {
    return Array.isArray(value) ? (value as EditorPatchOperation[]) : [];
  }
}
