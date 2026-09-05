import { PatchApplyService } from './patch-apply.service';
import { PageSchema, ComponentNode } from '@lowcode-platform/schema-contract';
import { EditorPatchOperation } from './types/editor-patch.types';

function createSchema(): PageSchema {
  return {
    schemaVersion: 0,
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

  it('preserves Page Logic while applying component-only Agent patches', () => {
    const schema: PageSchema = {
      ...createSchema(),
      logic: {
        states: { count: 1 },
        computed: { next: 'state.count + 1' },
      },
    };

    const result = service.applyPatch(schema, [
      {
        op: 'updateProps',
        componentId: 'button',
        props: { children: 'New' },
      },
    ]);

    expect(result.logic).toEqual(schema.logic);
    expect(result.logic).not.toBe(schema.logic);
    expect(result.logic?.computed).not.toBe(schema.logic?.computed);
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

  it('applies replacePageLogic atomically', () => {
    const schema = createSchema();
    const result = service.applyPatch(schema, [
      {
        op: 'replacePageLogic',
        logic: {
          states: { count: 10 },
          computed: { doubleCount: 'state.count * 2' },
        },
      },
    ]);

    expect(result.logic).toEqual({
      states: { count: 10 },
      computed: { doubleCount: 'state.count * 2' },
    });
    expect(Object.keys(result.components)).toEqual(Object.keys(schema.components));
    expect(result.components.button.props).toMatchObject({ children: 'Old' });
  });

  it('clears Page Logic with replacePageLogic using empty object', () => {
    const schema: PageSchema = {
      ...createSchema(),
      logic: {
        states: { active: true },
        computed: { title: "'Status: ' + state.active" },
      },
    };

    const result = service.applyPatch(schema, [
      {
        op: 'replacePageLogic',
        logic: {},
      },
    ]);

    expect(result.logic).toEqual({});
  });

  it('preserves -0 in states when updating component props without mutating logic declarations', () => {
    const schema: PageSchema = {
      ...createSchema(),
      logic: {
        states: { offset: -0 },
      },
    };

    const result = service.applyPatch(schema, [
      {
        op: 'updateProps',
        componentId: 'button',
        props: { children: 'New' },
      },
    ]);

    expect(result.components.button.props).toMatchObject({ children: 'New' });
    expect(Object.is(result.logic?.states?.offset, -0)).toBe(true);
  });

  it('preserves -0 in states during replacePageLogic', () => {
    const schema = createSchema();
    const result = service.applyPatch(schema, [
      {
        op: 'replacePageLogic',
        logic: {
          states: { offset: -0 },
        },
      },
    ]);
    expect(Object.is(result.logic?.states?.offset, -0)).toBe(true);
  });
});
