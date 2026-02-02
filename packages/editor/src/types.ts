import type { A2UISchema, ComponentRegistry } from "@lowcode-platform/renderer";

export interface LowcodeEditorProps {
  /**
   * 初始 JSON Schema (A2UI Format)
   */
  initialSchema?: A2UISchema | string;

  /**
   * 编辑器宽度
   * @default '50%'
   */
  editorWidth?: number | string;

  /**
   * 编辑器主题
   * @default 'vs-dark'
   */
  theme?: "vs" | "vs-dark" | "hc-black";

  /**
   * 容器高度
   * @default '100vh'
   */
  height?: number | string;

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
   * 是否显示行号
   * @default true
   */
  showLineNumbers?: boolean;

  /**
   * 是否自动换行
   * @default true
   */
  wordWrap?: boolean;

  /**
   * 事件上下文
   */
  eventContext?: Record<string, any>;
}
