import { AgentToolException } from '../agent-tool.exception';
import { PatchValidationService } from '../patch-validation.service';
import { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from '../types/tool.types';
import {
  asActionList,
  asOptionalNumber,
  asRecord,
  asRequiredNumber,
  asRequiredString,
  asStringArray,
  createObjectSchema,
} from '../tool-input.coerce';

export interface WriteToolsDeps {
  patchValidationService: PatchValidationService;
}

function executeWriteTools(
  patchValidationService: PatchValidationService,
  context: ToolExecutionContext,
  operations: import('../types/editor-patch.types').EditorPatchOperation[],
): ToolExecutionResult {
  patchValidationService.validatePatchShape(operations, context.traceId);
  const nextSchema = patchValidationService.previewValidatedSchema(
    context.workingSchema,
    operations,
    context.traceId,
  );
  return { patchDelta: operations, updatedWorkingSchema: nextSchema };
}

function executeWriteTool(
  patchValidationService: PatchValidationService,
  context: ToolExecutionContext,
  operation: import('../types/editor-patch.types').EditorPatchOperation,
): ToolExecutionResult {
  return executeWriteTools(patchValidationService, context, [operation]);
}

export function createWriteDefinitions(deps: WriteToolsDeps): ToolDefinition[] {
  const { patchValidationService } = deps;
  return [
    {
      name: 'insert_component',
      description: '在指定父组件下插入新组件。',
      inputSchema: createObjectSchema(
        '插入组件。',
        {
          parentId: { type: 'string', description: '父组件 ID。' },
          index: { type: 'number', description: '插入位置。为空时追加到末尾。' },
          component: { type: 'object', description: '新组件对象，必须包含 id 与 type。' },
        },
        ['parentId', 'component'],
      ),
      visibility: 'agent',
      execute: async (input, context) =>
        executeWriteTool(patchValidationService, context, {
          op: 'insertComponent',
          parentId: asRequiredString(input.parentId),
          index: asOptionalNumber(input.index),
          component: asRecord(input.component),
        }),
    },
    {
      name: 'update_component_props',
      description: '对目标组件 props 做浅合并更新。',
      inputSchema: createObjectSchema(
        '更新组件属性。',
        {
          componentId: { type: 'string', description: '目标组件 ID。' },
          props: { type: 'object', description: '要合并到组件 props 的键值对。' },
        },
        ['componentId', 'props'],
      ),
      visibility: 'agent',
      execute: async (input, context) =>
        executeWriteTool(patchValidationService, context, {
          op: 'updateProps',
          componentId: asRequiredString(input.componentId),
          props: asRecord(input.props),
        }),
    },
    {
      name: 'update_components_props',
      description: '对一组同类型组件批量做统一 props 浅合并更新。',
      inputSchema: createObjectSchema(
        '批量更新组件属性。',
        {
          componentIds: {
            type: 'array',
            description: '目标组件 ID 列表。',
            items: { type: 'string' },
          },
          props: { type: 'object', description: '要统一合并到每个组件 props 的键值对。' },
        },
        ['componentIds', 'props'],
      ),
      visibility: 'agent',
      execute: async (input, context) => {
        const componentIds = [...new Set(asStringArray(input.componentIds))];
        const props = asRecord(input.props);
        if (componentIds.length === 0) {
          throw new AgentToolException({
            code: 'PATCH_INVALID',
            message: 'update_components_props requires at least one componentId',
            traceId: context.traceId,
          });
        }
        const resolvedTypes = new Set(
          componentIds.map((id) => context.workingSchema.components[id]?.type),
        );
        if (componentIds.some((id) => !context.workingSchema.components[id])) {
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
        return executeWriteTools(
          patchValidationService,
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
      inputSchema: createObjectSchema(
        '绑定组件事件。',
        {
          componentId: { type: 'string', description: '目标组件 ID。' },
          event: { type: 'string', description: '事件 trigger，例如 onClick。' },
          actions: {
            type: 'array',
            description: '完整 action 列表，会整体替换对应 trigger。',
            items: { type: 'object' },
          },
        },
        ['componentId', 'event', 'actions'],
      ),
      visibility: 'agent',
      execute: async (input, context) =>
        executeWriteTool(patchValidationService, context, {
          op: 'bindEvent',
          componentId: asRequiredString(input.componentId),
          event: asRequiredString(input.event),
          actions: asActionList(input.actions),
        }),
    },
    {
      name: 'remove_component',
      description: '删除目标组件整棵子树。',
      inputSchema: createObjectSchema(
        '删除组件。',
        { componentId: { type: 'string', description: '目标组件 ID。' } },
        ['componentId'],
      ),
      visibility: 'agent',
      execute: async (input, context) =>
        executeWriteTool(patchValidationService, context, {
          op: 'removeComponent',
          componentId: asRequiredString(input.componentId),
        }),
    },
    {
      name: 'move_component',
      description: '移动已有组件到新的父组件和新位置。',
      inputSchema: createObjectSchema(
        '移动组件。',
        {
          componentId: { type: 'string', description: '要移动的组件 ID。' },
          newParentId: { type: 'string', description: '新父组件 ID。' },
          newIndex: { type: 'number', description: '新位置。' },
        },
        ['componentId', 'newParentId', 'newIndex'],
      ),
      visibility: 'agent',
      execute: async (input, context) =>
        executeWriteTool(patchValidationService, context, {
          op: 'moveComponent',
          componentId: asRequiredString(input.componentId),
          newParentId: asRequiredString(input.newParentId),
          newIndex: asRequiredNumber(input.newIndex),
        }),
    },
    {
      name: 'replace_page_logic',
      description:
        '原子替换整块页面逻辑声明（states 与 computed）。调用前必须先用 get_page_schema 读取当前 schema.logic，提交时传入完整 logic 对象，保留未要求修改的声明。',
      inputSchema: createObjectSchema(
        '原子替换页面逻辑声明。',
        {
          logic: {
            type: 'object',
            description: '完整的页面逻辑声明对象，包含 states 和 computed。',
          },
        },
        ['logic'],
      ),
      visibility: 'agent',
      execute: async (input, context) =>
        executeWriteTool(patchValidationService, context, {
          op: 'replacePageLogic',
          logic: asRecord(input.logic),
        }),
    },
  ];
}

export { executeWriteTool, executeWriteTools };
