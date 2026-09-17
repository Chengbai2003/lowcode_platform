import { ComponentMetaRegistry } from '../schema-context';
import { CollectionTargetResolverService } from '../schema-context/collection-target-resolver.service';
import type { PageSchema } from '../schema-context';
import { AgentIntentNormalizationService } from './agent-intent-normalization.service';

function createBatchSchema(): PageSchema {
  return {
    schemaVersion: 0,
    rootId: 'root',
    components: {
      root: { id: 'root', type: 'Page', childrenIds: ['form'] },
      form: { id: 'form', type: 'Form', childrenIds: ['form-item-a', 'form-item-b'] },
      'form-item-a': {
        id: 'form-item-a',
        type: 'FormItem',
        props: { label: '用户名', labelWidth: 120 },
        childrenIds: ['input-a'],
      },
      'form-item-b': {
        id: 'form-item-b',
        type: 'FormItem',
        props: { label: '密码', labelWidth: 120 },
        childrenIds: ['input-b'],
      },
      'input-a': { id: 'input-a', type: 'Input', props: { placeholder: '请输入用户名' } },
      'input-b': { id: 'input-b', type: 'Input', props: { placeholder: '请输入密码' } },
    },
  };
}

describe('AgentIntentNormalizationService', () => {
  const resolver = new CollectionTargetResolverService(new ComponentMetaRegistry());
  const service = new AgentIntentNormalizationService(resolver);

  it('normalizes explicit form item wording to a single semantic target', () => {
    const result = service.normalize({
      instruction: '把当前表单下所有表单项的 label 宽度改成 200',
      rootId: 'form',
      schema: createBatchSchema(),
    });

    expect(result).toEqual({
      status: 'normalized',
      option: expect.objectContaining({
        targetType: 'FormItem',
        label: '表单项',
      }),
    });
  });

  it('returns intent confirmation for ambiguous field wording', () => {
    const result = service.normalize({
      instruction: '把所有字段的 label 宽度改成 200',
      rootId: 'form',
      schema: createBatchSchema(),
    });

    expect(result.status).toBe('confirmation_required');
    if (result.status !== 'confirmation_required') {
      throw new Error('expected confirmation_required');
    }
    expect(result.options.map((option) => option.label)).toEqual(['表单项', '输入框']);
  });

  it('keeps explicit form field wording on the form item semantic target', () => {
    const result = service.normalize({
      instruction: '把当前表单下所有表单字段的 label 宽度改成 200',
      rootId: 'form',
      schema: createBatchSchema(),
    });

    expect(result).toEqual({
      status: 'normalized',
      option: expect.objectContaining({
        targetType: 'FormItem',
        label: '表单项',
      }),
    });
  });

  it('returns no_match when aliases do not resolve within the container subtree', () => {
    const result = service.normalize({
      instruction: '把所有按钮都隐藏',
      rootId: 'form',
      schema: createBatchSchema(),
    });

    expect(result).toEqual({ status: 'no_match' });
  });

  it('uses page-bound Meta so Button is recognized only under the matching profile', () => {
    // 页面 Meta：Button 存在且可批量；默认 Builtin Meta 在本 fixture 下不暴露 Button 批量目标
    const pageMeta = new ComponentMetaRegistry(
      [
        {
          type: 'Form',
          displayName: '表单',
          isContainer: true,
          textProps: ['children'],
          category: 'layout',
          properties: [],
        },
        {
          type: 'Button',
          displayName: '按钮',
          isContainer: false,
          textProps: ['children'],
          category: 'other',
          properties: [],
        },
      ],
      new Map(),
    );

    const schema: PageSchema = {
      schemaVersion: 0,
      rootId: 'form',
      components: {
        form: { id: 'form', type: 'Form', childrenIds: ['btn-1', 'btn-2'] },
        'btn-1': { id: 'btn-1', type: 'Button', props: { children: 'A' } },
        'btn-2': { id: 'btn-2', type: 'Button', props: { children: 'B' } },
      },
    };

    const withPageMeta = service.normalize({
      instruction: '把所有按钮都隐藏',
      rootId: 'form',
      schema,
      metaRegistry: pageMeta,
    });
    expect(withPageMeta).toEqual({
      status: 'normalized',
      option: expect.objectContaining({
        targetType: 'Button',
        label: '按钮',
      }),
    });

    // 不传页面 Meta 时，用注入的默认空/不完整 Registry 应 no_match，证明不是全局默认“碰巧匹配”
    const emptyMeta = new ComponentMetaRegistry([], new Map());
    const withoutPageMeta = service.normalize({
      instruction: '把所有按钮都隐藏',
      rootId: 'form',
      schema,
      metaRegistry: emptyMeta,
    });
    expect(withoutPageMeta).toEqual({ status: 'no_match' });
  });
});
