import { AgentToolException } from '../agent-tool.exception';
import { CollectionTargetResolverService } from '../../schema-context/collection-target-resolver.service';
import { ComponentMetaRegistry } from '../../schema-context/component-metadata/component-meta.registry';
import { ContextAssemblerService } from '../../schema-context/context-assembler.service';
import { ToolDefinition } from '../types/tool.types';
import { asOptionalString, createObjectSchema } from '../tool-input.coerce';

export interface ReadToolsDeps {
  contextAssembler: ContextAssemblerService;
  metaRegistry: ComponentMetaRegistry;
  collectionTargetResolver: CollectionTargetResolverService;
}

export function createReadDefinitions(deps: ReadToolsDeps): ToolDefinition[] {
  const { contextAssembler, metaRegistry, collectionTargetResolver } = deps;
  return [
    {
      name: 'get_page_schema',
      description: '读取当前 working schema。',
      inputSchema: createObjectSchema('读取当前 working schema，不需要额外参数。', {}),
      visibility: 'agent',
      execute: async (_input, context) => ({
        data: context.workingSchema,
      }),
    },
    {
      name: 'get_focus_context',
      description: '获取指定组件的聚焦上下文，包括父子关系、兄弟节点和局部子树。',
      inputSchema: createObjectSchema('获取焦点组件上下文。', {
        selectedId: { type: 'string', description: '目标组件 ID。' },
        instruction: { type: 'string', description: '当前用户指令，可选。' },
      }),
      visibility: 'agent',
      execute: async (input, context) => {
        const result = await contextAssembler.assemble({
          draftSchema: context.workingSchema as unknown as Record<string, unknown>,
          selectedId: asOptionalString(input.selectedId),
          instruction: asOptionalString(input.instruction),
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
        return { data: { mode: 'candidates' } };
      },
    },
    {
      name: 'find_node_candidates',
      description: '根据自然语言描述查找可能的组件候选。',
      inputSchema: createObjectSchema('查找候选节点。', {
        selectedId: { type: 'string', description: '当前选中的组件 ID，可选。' },
        instruction: { type: 'string', description: '用户自然语言指令。' },
      }),
      visibility: 'agent',
      execute: async (input, context) => {
        const result = await contextAssembler.assemble({
          draftSchema: context.workingSchema as unknown as Record<string, unknown>,
          selectedId: asOptionalString(input.selectedId),
          instruction: asOptionalString(input.instruction),
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
      inputSchema: createObjectSchema('读取组件元数据。', {
        type: { type: 'string', description: '组件类型。为空时返回全部组件元数据。' },
      }),
      visibility: 'agent',
      execute: async (input) => {
        const type = asOptionalString(input.type);
        if (type) return { data: { component: metaRegistry.resolve(type) } };
        return { data: { components: metaRegistry.getAll() } };
      },
    },
    {
      name: 'resolve_collection_scope',
      description: '在指定容器根节点下解析当前批量修改将命中的同类组件集合。',
      inputSchema: createObjectSchema(
        '解析批量修改范围。',
        {
          rootId: { type: 'string', description: '当前已选中的容器组件 ID。' },
          instruction: { type: 'string', description: '用户原始指令，用于识别目标组件类型。' },
          targetType: { type: 'string', description: '可选，显式指定已确认的目标组件类型。' },
        },
        ['rootId'],
      ),
      visibility: 'agent',
      execute: async (input, context) => {
        const rootId = asOptionalString(input.rootId);
        if (!rootId) {
          throw new AgentToolException({
            code: 'AGENT_POLICY_BLOCKED',
            message: 'resolve_collection_scope requires rootId',
            traceId: context.traceId,
          });
        }
        return {
          data: collectionTargetResolver.resolve({
            rootId,
            instruction: asOptionalString(input.instruction) ?? '',
            targetType: asOptionalString(input.targetType) ?? undefined,
            schema: context.workingSchema,
          }),
        };
      },
    },
  ];
}
