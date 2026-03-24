import { Injectable } from '@nestjs/common';
import { AgentToolException } from './agent-tool.exception';
import { ComponentMetaRegistry } from '../schema-context/component-metadata/component-meta.registry';
import { CollectionTargetResolverService } from '../schema-context/collection-target-resolver.service';
import { ContextAssemblerService } from '../schema-context/context-assembler.service';
import { PatchAutoFixService } from './patch-auto-fix.service';
import { PatchValidationService } from './patch-validation.service';
import { EditorAction, EditorActionList } from './types/editor-action.types';
import { EditorPatchOperation } from './types/editor-patch.types';
import {
  ToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
  ToolInputSchema,
  ToolVisibility,
} from './types/tool.types';

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
    if (!visibility) {
      return definitions;
    }

    return definitions.filter((definition) => definition.visibility === visibility);
  }

  private registerTools() {
    const definitions: ToolDefinition[] = [
      {
        name: 'get_page_schema',
        description: '读取当前 working schema。',
        inputSchema: this.createObjectSchema('读取当前 working schema，不需要额外参数。', {}),
        visibility: 'agent',
        execute: async (_input, context) => ({
          data: context.workingSchema,
        }),
      },
      {
        name: 'get_focus_context',
        description: '获取指定组件的聚焦上下文，包括父子关系、兄弟节点和局部子树。',
        inputSchema: this.createObjectSchema('获取焦点组件上下文。', {
          selectedId: {
            type: 'string',
            description: '目标组件 ID。',
          },
          instruction: {
            type: 'string',
            description: '当前用户指令，可选。',
          },
        }),
        visibility: 'agent',
        execute: async (input, context) => {
          const result = await this.contextAssembler.assemble({
            draftSchema: context.workingSchema as unknown as Record<string, unknown>,
            selectedId: this.asOptionalString(input.selectedId),
            instruction: this.asOptionalString(input.instruction),
          });

          if (result.mode === 'focused') {
            return {
              data: {
                mode: 'focused',
                context: result.context,
                componentList: result.componentList,
              },
            };
          }

          return {
            data: {
              mode: 'candidates',
            },
          };
        },
      },
      {
        name: 'find_node_candidates',
        description: '根据自然语言描述查找可能的组件候选。',
        inputSchema: this.createObjectSchema('查找候选节点。', {
          selectedId: {
            type: 'string',
            description: '当前选中的组件 ID，可选。',
          },
          instruction: {
            type: 'string',
            description: '用户自然语言指令。',
          },
        }),
        visibility: 'agent',
        execute: async (input, context) => {
          const result = await this.contextAssembler.assemble({
            draftSchema: context.workingSchema as unknown as Record<string, unknown>,
            selectedId: this.asOptionalString(input.selectedId),
            instruction: this.asOptionalString(input.instruction),
          });

          return {
            data: {
              candidates: result.mode === 'candidates' ? (result.candidates ?? []) : [],
            },
          };
        },
      },
      {
        name: 'get_component_meta',
        description: '读取组件元数据，了解组件 props 与事件能力。',
        inputSchema: this.createObjectSchema('读取组件元数据。', {
          type: {
            type: 'string',
            description: '组件类型。为空时返回全部组件元数据。',
          },
        }),
        visibility: 'agent',
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
        name: 'resolve_collection_scope',
        description: '在指定容器根节点下解析当前批量修改将命中的同类组件集合。',
        inputSchema: this.createObjectSchema(
          '解析批量修改范围。',
          {
            rootId: {
              type: 'string',
              description: '当前已选中的容器组件 ID。',
            },
            instruction: {
              type: 'string',
              description: '用户原始指令，用于识别目标组件类型。',
            },
            targetType: {
              type: 'string',
              description: '可选，显式指定已确认的目标组件类型。',
            },
          },
          ['rootId'],
        ),
        visibility: 'agent',
        execute: async (input, context) => {
          const rootId = this.asOptionalString(input.rootId);
          if (!rootId) {
            throw new AgentToolException({
              code: 'AGENT_POLICY_BLOCKED',
              message: 'resolve_collection_scope requires rootId',
              traceId: context.traceId,
            });
          }

          return {
            data: this.collectionTargetResolver.resolve({
              rootId,
              instruction: this.asOptionalString(input.instruction) ?? '',
              targetType: this.asOptionalString(input.targetType) ?? undefined,
              schema: context.workingSchema,
            }),
          };
        },
      },
      {
        name: 'insert_component',
        description: '在指定父组件下插入新组件。',
        inputSchema: this.createObjectSchema(
          '插入组件。',
          {
            parentId: {
              type: 'string',
              description: '父组件 ID。',
            },
            index: {
              type: 'number',
              description: '插入位置。为空时追加到末尾。',
            },
            component: {
              type: 'object',
              description: '新组件对象，必须包含 id 与 type。',
            },
          },
          ['parentId', 'component'],
        ),
        visibility: 'agent',
        execute: async (input, context) =>
          this.executeWriteTool(context, {
            op: 'insertComponent',
            parentId: this.asRequiredString(input.parentId),
            index: this.asOptionalNumber(input.index),
            component: this.asRecord(input.component),
          }),
      },
      {
        name: 'update_component_props',
        description: '对目标组件 props 做浅合并更新。',
        inputSchema: this.createObjectSchema(
          '更新组件属性。',
          {
            componentId: {
              type: 'string',
              description: '目标组件 ID。',
            },
            props: {
              type: 'object',
              description: '要合并到组件 props 的键值对。',
            },
          },
          ['componentId', 'props'],
        ),
        visibility: 'agent',
        execute: async (input, context) =>
          this.executeWriteTool(context, {
            op: 'updateProps',
            componentId: this.asRequiredString(input.componentId),
            props: this.asRecord(input.props),
          }),
      },
      {
        name: 'update_components_props',
        description: '对一组同类型组件批量做统一 props 浅合并更新。',
        inputSchema: this.createObjectSchema(
          '批量更新组件属性。',
          {
            componentIds: {
              type: 'array',
              description: '目标组件 ID 列表。',
              items: {
                type: 'string',
              },
            },
            props: {
              type: 'object',
              description: '要统一合并到每个组件 props 的键值对。',
            },
          },
          ['componentIds', 'props'],
        ),
        visibility: 'agent',
        execute: async (input, context) => {
          const componentIds = [...new Set(this.asStringArray(input.componentIds))];
          const props = this.asRecord(input.props);

          if (componentIds.length === 0) {
            throw new AgentToolException({
              code: 'PATCH_INVALID',
              message: 'update_components_props requires at least one componentId',
              traceId: context.traceId,
            });
          }

          const resolvedTypes = new Set(
            componentIds.map((componentId) => context.workingSchema.components[componentId]?.type),
          );
          if (componentIds.some((componentId) => !context.workingSchema.components[componentId])) {
            throw new AgentToolException({
              code: 'NODE_NOT_FOUND',
              message: 'update_components_props requires all componentIds to exist',
              traceId: context.traceId,
            });
          }
          if (resolvedTypes.size > 1) {
            throw new AgentToolException({
              code: 'AGENT_POLICY_BLOCKED',
              message: 'update_components_props only supports same-type targets',
              traceId: context.traceId,
            });
          }

          return this.executeWriteTools(
            context,
            componentIds.map((componentId) => ({
              op: 'updateProps' as const,
              componentId,
              props,
            })),
          );
        },
      },
      {
        name: 'bind_event',
        description: '替换目标 trigger 的完整 action 列表。',
        inputSchema: this.createObjectSchema(
          '绑定组件事件。',
          {
            componentId: {
              type: 'string',
              description: '目标组件 ID。',
            },
            event: {
              type: 'string',
              description: '事件 trigger，例如 onClick。',
            },
            actions: {
              type: 'array',
              description: '完整 action 列表，会整体替换对应 trigger。',
              items: {
                type: 'object',
              },
            },
          },
          ['componentId', 'event', 'actions'],
        ),
        visibility: 'agent',
        execute: async (input, context) =>
          this.executeWriteTool(context, {
            op: 'bindEvent',
            componentId: this.asRequiredString(input.componentId),
            event: this.asRequiredString(input.event),
            actions: this.asActionList(input.actions),
          }),
      },
      {
        name: 'remove_component',
        description: '删除目标组件整棵子树。',
        inputSchema: this.createObjectSchema(
          '删除组件。',
          {
            componentId: {
              type: 'string',
              description: '目标组件 ID。',
            },
          },
          ['componentId'],
        ),
        visibility: 'agent',
        execute: async (input, context) =>
          this.executeWriteTool(context, {
            op: 'removeComponent',
            componentId: this.asRequiredString(input.componentId),
          }),
      },
      {
        name: 'move_component',
        description: '移动已有组件到新的父组件和新位置。',
        inputSchema: this.createObjectSchema(
          '移动组件。',
          {
            componentId: {
              type: 'string',
              description: '要移动的组件 ID。',
            },
            newParentId: {
              type: 'string',
              description: '新父组件 ID。',
            },
            newIndex: {
              type: 'number',
              description: '新位置。',
            },
          },
          ['componentId', 'newParentId', 'newIndex'],
        ),
        visibility: 'agent',
        execute: async (input, context) =>
          this.executeWriteTool(context, {
            op: 'moveComponent',
            componentId: this.asRequiredString(input.componentId),
            newParentId: this.asRequiredString(input.newParentId),
            newIndex: this.asRequiredNumber(input.newIndex),
          }),
      },
      {
        name: 'validate_patch',
        description: '校验 patch 在当前 working schema 上是否有效。',
        inputSchema: this.createObjectSchema(
          '校验 patch。',
          {
            patch: {
              type: 'array',
              items: {
                type: 'object',
              },
            },
          },
          ['patch'],
        ),
        visibility: 'internal',
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
        description: '对 patch 做保守 auto-fix。',
        inputSchema: this.createObjectSchema(
          '自动修复 patch。',
          {
            patch: {
              type: 'array',
              items: {
                type: 'object',
              },
            },
          },
          ['patch'],
        ),
        visibility: 'internal',
        execute: async (input, context) => {
          const patch = this.asPatchArray(input.patch);
          const result = this.patchAutoFixService.autoFix(patch, context.workingSchema);
          return {
            data: { patch: result.patch },
            warnings: result.warnings,
          };
        },
      },
      {
        name: 'preview_patch',
        description: '在内存中预览 patch 应用结果。',
        inputSchema: this.createObjectSchema(
          '预览 patch。',
          {
            patch: {
              type: 'array',
              items: {
                type: 'object',
              },
            },
          },
          ['patch'],
        ),
        visibility: 'internal',
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
  ): ToolExecutionResult {
    return this.executeWriteTools(context, [operation]);
  }

  private executeWriteTools(
    context: ToolExecutionContext,
    operations: EditorPatchOperation[],
  ): ToolExecutionResult {
    this.patchValidationService.validatePatchShape(operations, context.traceId);
    const nextSchema = this.patchValidationService.previewValidatedSchema(
      context.workingSchema,
      operations,
      context.traceId,
    );

    return {
      patchDelta: operations,
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

  private asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    );
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

  private createObjectSchema(
    description: string,
    properties: Record<string, unknown>,
    required: string[] = [],
  ): ToolInputSchema {
    return {
      type: 'object',
      description,
      properties,
      required,
      additionalProperties: false,
    };
  }
}
