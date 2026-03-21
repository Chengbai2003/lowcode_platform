import { describe, it, expect } from 'vitest';
import { autoFixSchema } from '../utils/schema-auto-fix';

describe('autoFixSchema', () => {
  const whitelist = ['Page', 'Container', 'Button', 'Input', 'Text', 'Title'];

  it('should fix component type hallucinations', () => {
    const raw = {
      rootId: 'root',
      components: {
        root: { id: 'root', type: 'Page', childrenIds: ['btn1', 'inp1'] },
        btn1: { type: 'Btn', props: { children: 'Submit' } },
        inp1: { type: 'TextInput', props: { placeholder: 'Enter name' } },
      },
    };

    const { fixed, fixes } = autoFixSchema(raw, whitelist);

    expect(fixed.components['btn1'].type).toBe('Button');
    expect(fixed.components['inp1'].type).toBe('Input');
    expect(fixes).toContain('组件 btn1: 修正类型幻觉 (Btn -> Button)');
    expect(fixes).toContain('组件 inp1: 修正类型幻觉 (TextInput -> Input)');
  });

  it('should complete missing id fields', () => {
    const raw = {
      rootId: 'root',
      components: {
        root: { id: 'root', type: 'Page' },
        comp1: { type: 'Button' }, // Missing id
      },
    };

    const { fixed, fixes } = autoFixSchema(raw, whitelist);

    expect(fixed.components['comp1'].id).toBe('comp1');
    expect(fixes).toContain('组件 comp1: 补全缺失的 id 字段');
  });

  it('should remove invalid children references', () => {
    const raw = {
      rootId: 'root',
      components: {
        root: {
          id: 'root',
          type: 'Page',
          childrenIds: ['valid', 'invalid-id'],
        },
        valid: { id: 'valid', type: 'Button' },
      },
    };

    const { fixed, fixes } = autoFixSchema(raw, whitelist);

    expect(fixed.components['root'].childrenIds).toEqual(['valid']);
    expect(fixes).toContain('组件 root: 移除无效的子组件引用 (invalid-id)');
  });

  it('should fix rootId hallucination', () => {
    const raw = {
      rootId: 'wrong-root',
      components: {
        'real-root': { id: 'real-root', type: 'Page' },
      },
    };

    const { fixed, fixes } = autoFixSchema(raw, whitelist);

    expect(fixed.rootId).toBe('real-root');
    expect(fixes).toContain('修正 rootId (wrong-root -> real-root)');
  });

  it('should create a default Page if no components exist', () => {
    const raw = {
      components: {},
    };

    const { fixed, fixes } = autoFixSchema(raw, whitelist);

    expect(fixed.rootId).toBeDefined();
    expect(fixed.components[fixed.rootId].type).toBe('Page');
    expect(fixes).toContain('创建缺失的根组件 (Page)');
  });

  it('should coerce numeric string version to number', () => {
    const raw = {
      version: '5',
      rootId: 'root',
      components: {
        root: { id: 'root', type: 'Page' },
      },
    };

    const { fixed, fixes } = autoFixSchema(raw, whitelist);

    expect(fixed.version).toBe(5);
    expect(typeof fixed.version).toBe('number');
    expect(fixes).toContain('修正 version 类型 ("5" -> 5)');
  });

  it('should migrate text-like content props to children', () => {
    const raw = {
      rootId: 'root',
      components: {
        root: { id: 'root', type: 'Page', childrenIds: ['text1', 'button1'] },
        text1: { id: 'text1', type: 'Text', props: { content: '欢迎使用' } },
        button1: { id: 'button1', type: 'Button', props: { content: '提交' } },
      },
    };

    const { fixed, fixes } = autoFixSchema(raw, whitelist);

    expect(fixed.components['text1'].props).toEqual({ children: '欢迎使用' });
    expect(fixed.components['button1'].props).toEqual({ children: '提交' });
    expect(fixes).toContain('组件 text1: 将 props.content 迁移为 props.children');
    expect(fixes).toContain('组件 button1: 将 props.content 迁移为 props.children');
  });
});
