import { PatchAutoFixService } from './patch-auto-fix.service';
import { EditorPatchOperation } from './types/editor-patch.types';

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
    expect(result.warnings).toEqual([]);
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
