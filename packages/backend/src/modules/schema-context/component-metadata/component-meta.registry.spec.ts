import { ComponentMetaRegistry } from './component-meta.registry';

describe('ComponentMetaRegistry', () => {
  let registry: ComponentMetaRegistry;

  beforeEach(() => {
    registry = new ComponentMetaRegistry();
  });

  it('contains all expected component types', () => {
    const types = registry.getAllTypeNames();
    expect(types.length).toBeGreaterThanOrEqual(48);
    expect(types).toContain('Button');
    expect(types).toContain('Input');
    expect(types).toContain('Page');
    expect(types).toContain('Container');
    expect(types).toContain('Table');
  });

  it('resolves aliases correctly', () => {
    const meta = registry.resolve('Btn');
    expect(meta).toBeDefined();
    expect(meta!.type).toBe('Button');
  });

  it('returns correct displayName', () => {
    expect(registry.getDisplayName('Button')).toBe('按钮');
    expect(registry.getDisplayName('Input')).toBe('输入框');
    expect(registry.getDisplayName('Table')).toBe('表格');
  });

  it('identifies containers correctly', () => {
    expect(registry.isContainer('Container')).toBe(true);
    expect(registry.isContainer('Form')).toBe(true);
    expect(registry.isContainer('Button')).toBe(false);
    expect(registry.isContainer('Input')).toBe(false);
  });

  it('returns correct textProps', () => {
    expect(registry.getTextProps('Button')).toEqual(['children']);
    expect(registry.getTextProps('Input')).toEqual(['placeholder', 'defaultValue']);
    expect(registry.getTextProps('Alert')).toEqual(['message', 'description']);
  });

  it('keeps Paragraph as its own concrete component', () => {
    expect(registry.get('Paragraph')?.type).toBe('Paragraph');
    expect(registry.resolve('Paragraph')?.type).toBe('Paragraph');
    expect(registry.resolve('P')?.type).toBe('Paragraph');
  });

  it('does not resolve dangerous prototype keys as aliases', () => {
    expect(registry.resolve('__proto__')).toBeUndefined();
    expect(registry.resolve('constructor')).toBeUndefined();
  });
});
