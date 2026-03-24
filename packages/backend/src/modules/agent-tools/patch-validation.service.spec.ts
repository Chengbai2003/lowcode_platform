import { ComponentMetaRegistry } from '../schema-context/component-metadata/component-meta.registry';
import { A2UISchema } from '../schema-context/types/schema.types';
import { AgentToolException } from './agent-tool.exception';
import { PatchApplyService } from './patch-apply.service';
import { PatchValidationService } from './patch-validation.service';
import { EditorPatchOperation } from './types/editor-patch.types';

function createSchema(): A2UISchema {
  return {
    version: 2,
    rootId: 'root',
    components: {
      root: {
        id: 'root',
        type: 'Page',
        childrenIds: ['form'],
      },
      form: {
        id: 'form',
        type: 'Form',
        childrenIds: ['button'],
      },
      button: {
        id: 'button',
        type: 'Button',
        props: { children: '提交' },
      },
    },
  };
}

function createSchemaWithDetachedHiddenDataNodes(): A2UISchema {
  return {
    version: 2,
    rootId: 'root',
    components: {
      ticketDetail: {
        id: 'ticketDetail',
        type: 'Div',
        props: {
          visible: false,
          initialValue: {
            code: 'TASK-001',
            status: '处理中',
          },
        },
        childrenIds: [],
      },
      ticketLogs: {
        id: 'ticketLogs',
        type: 'Div',
        props: {
          visible: false,
          initialValue: [{ key: '1', action: '提交申请' }],
        },
        childrenIds: [],
      },
      root: {
        id: 'root',
        type: 'Page',
        childrenIds: ['headerActions'],
      },
      headerActions: {
        id: 'headerActions',
        type: 'Space',
        childrenIds: ['btn-pass'],
      },
      'btn-pass': {
        id: 'btn-pass',
        type: 'Button',
        props: { children: '通过' },
      },
    },
  };
}

async function expectToolError(callback: () => void, code: string, message?: string) {
  try {
    callback();
    throw new Error('Expected callback to throw');
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

describe('PatchValidationService', () => {
  let applyService: PatchApplyService;
  let service: PatchValidationService;

  beforeEach(() => {
    applyService = new PatchApplyService();
    service = new PatchValidationService(new ComponentMetaRegistry(), applyService);
  });

  it('accepts sequential patch operations when later steps target newly inserted nodes', () => {
    const baseSchema = createSchema();
    const patch: EditorPatchOperation[] = [
      {
        op: 'insertComponent',
        parentId: 'form',
        component: {
          id: 'new-input',
          type: 'Input',
          props: { placeholder: '邮箱' },
        },
      },
      {
        op: 'updateProps',
        componentId: 'new-input',
        props: { placeholder: '请输入邮箱' },
      },
    ];
    const resultSchema = applyService.applyPatch(baseSchema, patch);

    expect(() =>
      service.validatePatchAgainstSchema(baseSchema, patch, resultSchema, 'trace-1'),
    ).not.toThrow();
  });

  it('allows detached hidden data nodes that are outside of the root subtree', () => {
    const baseSchema = createSchemaWithDetachedHiddenDataNodes();
    const patch: EditorPatchOperation[] = [
      {
        op: 'updateProps',
        componentId: 'btn-pass',
        props: { children: 'pass' },
      },
    ];
    const resultSchema = applyService.applyPatch(baseSchema, patch);

    expect(() =>
      service.validatePatchAgainstSchema(baseSchema, patch, resultSchema, 'trace-hidden'),
    ).not.toThrow();
  });

  it('rejects customScript in bindEvent', async () => {
    const patch: EditorPatchOperation[] = [
      {
        op: 'bindEvent',
        componentId: 'button',
        event: 'onClick',
        actions: [{ type: 'customScript', code: 'alert(1)' }],
      },
    ];

    await expectToolError(() => {
      service.validatePatchAgainstSchema(createSchema(), patch, createSchema(), 'trace-1');
    }, 'PATCH_POLICY_BLOCKED');
  });

  it('rejects missing componentId targets', async () => {
    const patch: EditorPatchOperation[] = [
      {
        op: 'updateProps',
        componentId: 'missing',
        props: { children: 'Nope' },
      },
    ];

    await expectToolError(() => {
      service.validatePatchAgainstSchema(createSchema(), patch, createSchema(), 'trace-1');
    }, 'NODE_NOT_FOUND');
  });

  it('rejects unsupported inserted component types', async () => {
    const patch: EditorPatchOperation[] = [
      {
        op: 'insertComponent',
        parentId: 'form',
        component: {
          id: 'fancy',
          type: 'UnknownWidget',
        },
      },
    ];

    await expectToolError(
      () => {
        service.validatePatchAgainstSchema(createSchema(), patch, createSchema(), 'trace-1');
      },
      'PATCH_INVALID',
      'Unsupported component type',
    );
  });

  it('rejects removing the root node', async () => {
    const patch: EditorPatchOperation[] = [
      {
        op: 'removeComponent',
        componentId: 'root',
      },
    ];

    await expectToolError(
      () => {
        service.validatePatchAgainstSchema(createSchema(), patch, createSchema(), 'trace-1');
      },
      'PATCH_INVALID',
      'root',
    );
  });

  it('still rejects actual orphan components after applying a patch', async () => {
    const schemaWithOrphan: A2UISchema = {
      version: 2,
      rootId: 'root',
      components: {
        ...createSchema().components,
        orphan: {
          id: 'orphan',
          type: 'Div',
          props: { children: 'dangling' },
          childrenIds: [],
        },
      },
    };
    const patch: EditorPatchOperation[] = [
      {
        op: 'updateProps',
        componentId: 'button',
        props: { children: '继续提交' },
      },
    ];

    await expectToolError(
      () => {
        service.validatePatchAgainstSchema(
          schemaWithOrphan,
          patch,
          schemaWithOrphan,
          'trace-orphan',
        );
      },
      'SCHEMA_INVALID',
      'orphaned components',
    );
  });

  it('rejects moveComponent cycles', async () => {
    const nestedSchema: A2UISchema = {
      rootId: 'root',
      components: {
        root: {
          id: 'root',
          type: 'Page',
          childrenIds: ['parent'],
        },
        parent: {
          id: 'parent',
          type: 'Container',
          childrenIds: ['child'],
        },
        child: {
          id: 'child',
          type: 'Container',
          childrenIds: [],
        },
      },
    };
    const patch: EditorPatchOperation[] = [
      {
        op: 'moveComponent',
        componentId: 'parent',
        newParentId: 'child',
        newIndex: 0,
      },
    ];

    await expectToolError(
      () => {
        service.validatePatchAgainstSchema(nestedSchema, patch, nestedSchema, 'trace-1');
      },
      'PATCH_INVALID',
      'descendant',
    );
  });
});
