import { describe, expect, it } from 'vitest';
import type { A2UISchema } from '../../types';
import type { EditorPatchOperation } from '../types/patch';
import { applyPatchToSchema } from './patchAdapter';

function createSchema(): A2UISchema {
  return {
    version: 5,
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
        childrenIds: ['child'],
      },
      child: {
        id: 'child',
        type: 'Input',
        props: { placeholder: 'child' },
      },
    },
  };
}

describe('applyPatchToSchema', () => {
  it('applies insertComponent', () => {
    const result = applyPatchToSchema(createSchema(), [
      {
        op: 'insertComponent',
        parentId: 'container',
        component: {
          id: 'input-email',
          type: 'Input',
          props: { placeholder: 'Email' },
        },
      },
    ]);

    expect(result.components['input-email']).toBeDefined();
    expect(result.components.container.childrenIds).toContain('input-email');
  });

  it('applies updateProps', () => {
    const result = applyPatchToSchema(createSchema(), [
      {
        op: 'updateProps',
        componentId: 'button',
        props: { children: '提交', disabled: true },
      },
    ]);

    expect(result.components.button.props).toMatchObject({
      children: '提交',
      disabled: true,
    });
  });

  it('applies bindEvent with replace semantics', () => {
    const result = applyPatchToSchema(createSchema(), [
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

  it('removes subtrees recursively', () => {
    const result = applyPatchToSchema(createSchema(), [
      {
        op: 'removeComponent',
        componentId: 'group',
      },
    ]);

    expect(result.components.group).toBeUndefined();
    expect(result.components.child).toBeUndefined();
    expect(result.components.container.childrenIds).toEqual(['button']);
  });

  it('moves components across parents', () => {
    const result = applyPatchToSchema(createSchema(), [
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

  it('applies a patch sequence consistently', () => {
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
      {
        op: 'updateProps',
        componentId: 'new-input',
        props: { placeholder: '请输入邮箱' },
      },
    ];

    const result = applyPatchToSchema(createSchema(), patch);
    expect(result.components['new-input'].props?.placeholder).toBe('请输入邮箱');
  });
});
