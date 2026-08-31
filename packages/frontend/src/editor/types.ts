import type {
  PageSchema,
  ComponentRegistry,
  ComponentExtension,
  ComponentNode,
  PropertyMeta,
  NotificationOptions,
  ModalOptions,
} from '../types';

// Re-export types for convenience
export type {
  PageSchema,
  ComponentRegistry,
  ComponentExtension,
  ComponentNode,
  PropertyMeta,
  NotificationOptions,
  ModalOptions,
};

export interface LowcodeEditorProps {
  /**
   * 页面唯一标识；提供后将启用后端版本化保存/加载
   */
  pageId?: string;

  /**
   * 页面展示名称
   */
  projectName?: string;

  /**
   * 初始 JSON Schema (A2UI Format)
   */
  initialSchema?: PageSchema | string;

  /**
   * 自定义组件扩展。每项必须声明 Manifest 与 Compiler import 绑定。
   */
  components?: Record<string, ComponentExtension>;

  /**
   * Schema 变更回调
   */
  onChange?: (schema: PageSchema) => void;

  /**
   * 错误回调
   */
  onError?: (error: string) => void;

  /**
   * 事件上下文
   */
  eventContext?: EventContext;

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

export interface EventUIContext {
  message?: {
    success: (content: string) => void;
    error: (content: string) => void;
    warning: (content: string) => void;
    info: (content: string) => void;
  };
  notification?: {
    success: (options: NotificationOptions) => void;
    error: (options: NotificationOptions) => void;
    warning: (options: NotificationOptions) => void;
    info: (options: NotificationOptions) => void;
  };
  modal?: {
    confirm: (options: ModalOptions) => Promise<boolean>;
    info: (options: ModalOptions) => Promise<void>;
    success: (options: ModalOptions) => Promise<void>;
    error: (options: ModalOptions) => Promise<void>;
    warning: (options: ModalOptions) => Promise<void>;
  };
  openTab?: (url: string) => void;
}

export interface EventContext {
  ui?: EventUIContext;
  [key: string]: unknown;
}
