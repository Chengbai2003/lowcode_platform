import { PatchApplyService } from './patch-apply.service';
import { A2UISchema } from '../schema-context/types/schema.types';
import { EditorPatchOperation } from './types/editor-patch.types';

function createSchema(): A2UISchema {
  return {
    version: 3,
    rootId: 'root',
    components: {
      root: {
        id: 'root',
        type: 'Page',
        childrenIds: ['container', 'sidebar'],
      },
      container: {
        id: 'container',
        type: 'Container',
        childrenIds: ['button', 'group'],
      },
      sidebar: {
        id: 'sidebar',
        type: 'Container',
        childrenIds: [],
      },
      button: {
        id: 'button',
        type: 'Button',
        props: { children: 'Old' },
      },
      group: {
        id: 'group',
        type: 'Container',
        childrenIds: ['child-input'],
      },
      'child-input': {
        id: 'child-input',
        type: 'Input',
        props: { placeholder: 'child' },
      },
    },
  };
}

describe('PatchApplyService', () => {
  let service: PatchApplyService;

  beforeEach(() => {
    service = new PatchApplyService();
  });

  it('applies insertComponent', () => {
    const schema = createSchema();
    const patch: EditorPatchOperation[] = [
      {
        op: 'insertComponent',
        parentId: 'container',
        component: {
          id: 'new-input',
          type: 'Input',
          props: { placeholder: 'Email' },
        },
      },
    ];

    const result = service.applyPatch(schema, patch);

    expect(result.components['new-input']).toMatchObject({
      id: 'new-input',
      type: 'Input',
    });
    expect(result.components.container.childrenIds).toContain('new-input');
  });

  it('applies updateProps', () => {
    const result = service.applyPatch(createSchema(), [
      {
        op: 'updateProps',
        componentId: 'button',
        props: { children: '提交', loading: true },
      },
    ]);

    expect(result.components.button.props).toMatchObject({
      children: '提交',
      loading: true,
    });
  });

  it('applies bindEvent with replace semantics', () => {
    const result = service.applyPatch(createSchema(), [
      {
        op: 'bindEvent',
        componentId: 'button',
        event: 'onClick',
        actions: [{ type: 'apiCall', url: '/api/save', method: 'POST' }],
      },
    ]);

    expect(result.components.button.events).toEqual({
      onClick: [{ type: 'apiCall', url: '/api/save', method: 'POST' }],
    });
  });

  it('applies removeComponent recursively', () => {
    const result = service.applyPatch(createSchema(), [
      {
        op: 'removeComponent',
        componentId: 'group',
      },
    ]);

    expect(result.components.group).toBeUndefined();
    expect(result.components['child-input']).toBeUndefined();
    expect(result.components.container.childrenIds).toEqual(['button']);
  });

  it('applies moveComponent across parents', () => {
    const result = service.applyPatch(createSchema(), [
      {
        op: 'moveComponent',
        componentId: 'button',
        newParentId: 'sidebar',
        newIndex: 0,
      },
    ]);

    expect(result.components.container.childrenIds).not.toContain('button');
    expect(result.components.sidebar.childrenIds).toEqual(['button']);
  });
});
