import { ContextAssemblerService } from '../schema-context';
import { ComponentMetaRegistry } from '../schema-context/component-metadata/component-meta.registry';
import { A2UISchema } from '../schema-context/types/schema.types';
import { PageSchemaService } from '../page-schema/page-schema.service';
import { AgentToolException } from './agent-tool.exception';
import { PatchApplyService } from './patch-apply.service';
import { PatchAutoFixService } from './patch-auto-fix.service';
import { PatchValidationService } from './patch-validation.service';
import { ToolExecutionService } from './tool-execution.service';
import { ToolRegistryService } from './tool-registry.service';
import { ToolExecutionContext } from './types/tool.types';

function createSchema(): A2UISchema {
  return {
    version: 4,
    rootId: 'root',
    components: {
      root: {
        id: 'root',
        type: 'Page',
        childrenIds: ['container', 'sibling'],
      },
      container: {
        id: 'container',
        type: 'Container',
        childrenIds: ['button', 'group'],
      },
      sibling: {
        id: 'sibling',
        type: 'Container',
        childrenIds: [],
      },
      button: {
        id: 'button',
        type: 'Button',
        props: { children: '提交' },
      },
      group: {
        id: 'group',
        type: 'Container',
        childrenIds: ['child-input'],
      },
      'child-input': {
        id: 'child-input',
        type: 'Input',
        props: { placeholder: 'Name' },
      },
    },
  };
}

async function expectToolError(callback: () => Promise<unknown>, code: string, message?: string) {
  try {
    await callback();
    throw new Error('Expected callback to reject');
  } catch (error) {
    expect(error).toBeInstanceOf(AgentToolException);
    const response = (error as AgentToolException).getResponse() as {
      code: string;
      message: string;
    };
    expect(response.code).toBe(code);
    if (message) {
      expect(response.message).toContain(message);
    }
  }
}

describe('ToolExecutionService', () => {
  let service: ToolExecutionService;
  let pageSchemaServiceMock: Pick<PageSchemaService, 'getSchema'>;

  beforeEach(() => {
    pageSchemaServiceMock = {
      getSchema: jest.fn().mockResolvedValue({
        pageId: 'page-1',
        version: 4,
        snapshotId: 'page-1-v4',
        savedAt: '2026-03-20T00:00:00.000Z',
        schema: createSchema(),
      }),
    };

    const contextAssemblerMock: Pick<ContextAssemblerService, 'assemble'> = {
      assemble: jest.fn(),
    };

    const metaRegistry = new ComponentMetaRegistry();
    const patchApplyService = new PatchApplyService();
    const patchValidationService = new PatchValidationService(metaRegistry, patchApplyService);
    const patchAutoFixService = new PatchAutoFixService();
    const toolRegistry = new ToolRegistryService(
      pageSchemaServiceMock as PageSchemaService,
      contextAssemblerMock as ContextAssemblerService,
      metaRegistry,
      patchApplyService,
      patchAutoFixService,
      patchValidationService,
    );

    service = new ToolExecutionService(
      pageSchemaServiceMock as PageSchemaService,
      contextAssemblerMock as ContextAssemblerService,
      toolRegistry,
    );
  });

  async function createContext(): Promise<ToolExecutionContext> {
    return service.createExecutionContext(
      { draftSchema: createSchema() as unknown as Record<string, unknown> },
      'trace-1',
    );
  }

  it('executes update_component_props successfully', async () => {
    const context = await createContext();

    await service.executeTool(
      'update_component_props',
      { componentId: 'button', props: { children: '立即提交' } },
      context,
    );

    expect(context.workingSchema.components.button.props?.children).toBe('立即提交');
  });

  it('rejects update_component_props for missing targets', async () => {
    const context = await createContext();

    await expectToolError(
      () =>
        service.executeTool(
          'update_component_props',
          { componentId: 'missing', props: {} },
          context,
        ),
      'NODE_NOT_FOUND',
    );
  });

  it('executes insert_component successfully', async () => {
    const context = await createContext();

    await service.executeTool(
      'insert_component',
      {
        parentId: 'container',
        component: { id: 'extra-input', type: 'Input', props: { placeholder: 'Email' } },
      },
      context,
    );

    expect(context.workingSchema.components['extra-input']).toBeDefined();
  });

  it('rejects insert_component with unsupported component types', async () => {
    const context = await createContext();

    await expectToolError(
      () =>
        service.executeTool(
          'insert_component',
          { parentId: 'container', component: { id: 'extra', type: 'FakeWidget' } },
          context,
        ),
      'PATCH_INVALID',
      'Unsupported component type',
    );
  });

  it('executes bind_event successfully', async () => {
    const context = await createContext();

    await service.executeTool(
      'bind_event',
      {
        componentId: 'button',
        event: 'onClick',
        actions: [{ type: 'apiCall', url: '/api/save', method: 'POST' }],
      },
      context,
    );

    expect(context.workingSchema.components.button.events?.onClick).toEqual([
      { type: 'apiCall', url: '/api/save', method: 'POST' },
    ]);
  });

  it('rejects bind_event with customScript', async () => {
    const context = await createContext();

    await expectToolError(
      () =>
        service.executeTool(
          'bind_event',
          {
            componentId: 'button',
            event: 'onClick',
            actions: [{ type: 'customScript', code: 'alert(1)' }],
          },
          context,
        ),
      'PATCH_POLICY_BLOCKED',
    );
  });

  it('executes remove_component successfully', async () => {
    const context = await createContext();

    await service.executeTool('remove_component', { componentId: 'group' }, context);

    expect(context.workingSchema.components.group).toBeUndefined();
    expect(context.workingSchema.components['child-input']).toBeUndefined();
  });

  it('rejects remove_component for missing nodes', async () => {
    const context = await createContext();

    await expectToolError(
      () => service.executeTool('remove_component', { componentId: 'missing' }, context),
      'NODE_NOT_FOUND',
    );
  });

  it('executes move_component successfully', async () => {
    const context = await createContext();

    await service.executeTool(
      'move_component',
      { componentId: 'button', newParentId: 'sibling', newIndex: 0 },
      context,
    );

    expect(context.workingSchema.components.sibling.childrenIds).toEqual(['button']);
  });

  it('rejects move_component cycles', async () => {
    const nestedSchema: A2UISchema = {
      rootId: 'root',
      components: {
        root: { id: 'root', type: 'Page', childrenIds: ['parent'] },
        parent: { id: 'parent', type: 'Container', childrenIds: ['child'] },
        child: { id: 'child', type: 'Container', childrenIds: [] },
      },
    };
    const context = await service.createExecutionContext(
      { draftSchema: nestedSchema as unknown as Record<string, unknown> },
      'trace-1',
    );

    await expectToolError(
      () =>
        service.executeTool(
          'move_component',
          { componentId: 'parent', newParentId: 'child', newIndex: 0 },
          context,
        ),
      'PATCH_INVALID',
      'descendant',
    );
  });

  it('normalizes patch input when previewPatch is called with autoFix enabled', async () => {
    const response = await service.previewPatch(
      {
        draftSchema: createSchema() as unknown as Record<string, unknown>,
        autoFix: true,
        patch: [
          {
            op: 'insertComponent',
            parentId: 'container',
            index: -1,
            component: {
              id: 'input_email',
              type: 'Input',
              props: { placeholder: '邮箱' },
              events: [] as unknown as Record<string, unknown>,
            },
          },
        ],
      },
      'trace-1',
    );

    expect(response.patch[0]).toMatchObject({
      op: 'insertComponent',
      parentId: 'container',
      index: undefined,
      component: {
        id: 'input_email',
        type: 'Input',
        events: {},
      },
    });
    expect(response.warnings).toContain('Normalized insert index for component under container');
    expect(response.schema.components.input_email).toBeDefined();
  });
});
