import type { ComponentSchema } from '@lowcode-platform/renderer';

/**
 * 编辑器属性
 */
export interface LowcodeEditorProps {
  /**
   * 初始 Schema JSON
   */
  initialSchema?: ComponentSchema | string;

  /**
   * 编辑器面板宽度（百分比或像素）
   * @default '50%'
   */
  editorWidth?: string | number;

  /**
   * Monaco 编辑器主题
   * @default 'vs-dark'
   */
  theme?: 'vs' | 'vs-dark' | 'hc-black';

  /**
   * 编辑器容器高度
   * @default '100vh'
   */
  height?: string | number;

  /**
   * 自定义组件注册表
   */
  components?: Record<string, React.ComponentType<any>>;

  /**
   * Schema 变化时的回调
   */
  onChange?: (schema: ComponentSchema) => void;

  /**
   * JSON 无效时的回调
   */
  onError?: (error: string) => void;

  /**
   * 是否显示行号
   * @default true
   */
  showLineNumbers?: boolean;

  /**
   * 是否启用自动换行
   * @default true
   */
  wordWrap?: boolean;

  /**
   * 事件执行上下文（可在事件代码中使用的变量）
   */
  eventContext?: Record<string, any>;
}
