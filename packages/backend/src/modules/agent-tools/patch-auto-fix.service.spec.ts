import { PatchAutoFixService } from './patch-auto-fix.service';
import { EditorPatchOperation } from './types/editor-patch.types';
import { A2UISchema } from '../schema-context/types/schema.types';

describe('PatchAutoFixService', () => {
  let service: PatchAutoFixService;

  beforeEach(() => {
    service = new PatchAutoFixService();
  });

  it('normalizes insertComponent index and component containers', () => {
    const patch: EditorPatchOperation[] = [
      {
        op: 'insertComponent',
        parentId: 'form',
        index: -1,
        component: {
          id: 'input_email',
          type: 'Input',
          props: { placeholder: '邮箱' },
          childrenIds: ['child_a', 'child_a', 123 as unknown as string],
          events: [] as unknown as Record<string, unknown>,
        },
      },
    ];

    const result = service.autoFix(patch);
    const operation = result.patch[0];

    expect(operation).toMatchObject({
      op: 'insertComponent',
      parentId: 'form',
      index: undefined,
      component: {
        id: 'input_email',
        type: 'Input',
        props: { placeholder: '邮箱' },
        childrenIds: ['child_a'],
        events: {},
      },
    });
    expect(result.warnings).toContain('Normalized insert index for component under form');
  });

  it('normalizes negative move indexes to zero', () => {
    const patch: EditorPatchOperation[] = [
      {
        op: 'moveComponent',
        componentId: 'button_submit',
        newParentId: 'footer_actions',
        newIndex: -3,
      },
    ];

    const result = service.autoFix(patch);

    expect(result.patch[0]).toEqual({
      op: 'moveComponent',
      componentId: 'button_submit',
      newParentId: 'footer_actions',
      newIndex: 0,
    });
    expect(result.warnings).toContain('Normalized move index for button_submit');
  });

  it('normalizes bindEvent actions to an empty array when malformed', () => {
    const patch = [
      {
        op: 'bindEvent',
        componentId: 'button_submit',
        event: 'onClick',
        actions: undefined,
      },
    ] as unknown as EditorPatchOperation[];

    const result = service.autoFix(patch);

    expect(result.patch[0]).toEqual({
      op: 'bindEvent',
      componentId: 'button_submit',
      event: 'onClick',
      actions: [],
    });
    expect(result.warnings).toContain('Normalized action payloads for button_submit.onClick');
  });

  it('normalizes feedback alias fields to renderer-compatible keys', () => {
    const patch: EditorPatchOperation[] = [
      {
        op: 'bindEvent',
        componentId: 'button_submit',
        event: 'onClick',
        actions: [
          {
            type: 'feedback',
            message: '登录成功',
            type_: 'success',
          },
        ],
      },
    ];

    const result = service.autoFix(patch);

    expect(result.patch[0]).toEqual({
      op: 'bindEvent',
      componentId: 'button_submit',
      event: 'onClick',
      actions: [
        {
          type: 'feedback',
          kind: 'message',
          content: '登录成功',
          level: 'success',
        },
      ],
    });
    expect(result.warnings).toContain('Normalized action payloads for button_submit.onClick');
  });

  it('normalizes Button danger alias in updateProps with schema context', () => {
    const schema: A2UISchema = {
      rootId: 'root',
      components: {
        root: { id: 'root', type: 'Page', childrenIds: ['button_submit'] },
        button_submit: {
          id: 'button_submit',
          type: 'Button',
          props: { type: 'primary', children: '删除' },
        },
      },
    };
    const patch: EditorPatchOperation[] = [
      {
        op: 'updateProps',
        componentId: 'button_submit',
        props: { type: 'danger' },
      },
    ];

    const result = service.autoFix(patch, schema);

    expect(result.patch[0]).toEqual({
      op: 'updateProps',
      componentId: 'button_submit',
      props: { danger: true },
    });
    expect(result.warnings).toContain('Normalized Button danger prop for button_submit');
  });

  it('normalizes Button danger alias in inserted components', () => {
    const patch: EditorPatchOperation[] = [
      {
        op: 'insertComponent',
        parentId: 'actions',
        component: {
          id: 'button_delete',
          type: 'Button',
          props: { children: '删除', type: 'danger' },
        },
      },
    ];

    const result = service.autoFix(patch);

    expect(result.patch[0]).toEqual({
      op: 'insertComponent',
      parentId: 'actions',
      component: {
        id: 'button_delete',
        type: 'Button',
        props: { children: '删除', danger: true },
        childrenIds: [],
        events: {},
      },
    });
    expect(result.warnings).toContain(
      'Normalized Button danger prop for inserted component button_delete',
    );
  });

  it('leaves already valid patch operations unchanged', () => {
    const patch: EditorPatchOperation[] = [
      {
        op: 'updateProps',
        componentId: 'button_submit',
        props: { children: '提交' },
      },
    ];

    const result = service.autoFix(patch);

    expect(result.patch).toEqual(patch);
    expect(result.warnings).toEqual([]);
  });
});
