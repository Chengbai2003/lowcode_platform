import { ComponentMetaRegistry } from '../schema-context';
import { CollectionTargetResolverService } from '../schema-context/collection-target-resolver.service';
import type { A2UISchema } from '../schema-context';
import { AgentIntentNormalizationService } from './agent-intent-normalization.service';

function createBatchSchema(): A2UISchema {
  return {
    version: 3,
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
});
