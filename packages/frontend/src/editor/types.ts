import type { A2UISchema, ComponentRegistry, A2UIComponent, PropertyMeta } from '../types';

// Re-export types for convenience
export type { A2UISchema, ComponentRegistry, A2UIComponent, PropertyMeta };

export interface LowcodeEditorProps {
  /**
   * 初始 JSON Schema (A2UI Format)
   */
  initialSchema?: A2UISchema | string;

  /**
   * 自定义组件映射
   */
  components?: ComponentRegistry;

  /**
   * Schema 变更回调
   */
  onChange?: (schema: A2UISchema) => void;

  /**
   * 错误回调
   */
  onError?: (error: string) => void;

  /**
   * 事件上下文
   */
  eventContext?: Record<string, any>;

  /**
   * 编辑器高度
   */
  height?: string;

  /**
   * 编辑器宽度
   */
  editorWidth?: string;

  /**
   * 主题
   */
  theme?: 'light' | 'dark' | 'vs-dark';
}
