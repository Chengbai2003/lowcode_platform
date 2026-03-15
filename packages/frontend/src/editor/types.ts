import type {
  A2UISchema,
  ComponentRegistry,
  A2UIComponent,
  PropertyMeta,
  NotificationOptions,
  ModalOptions,
} from '../types';

// Re-export types for convenience
export type {
  A2UISchema,
  ComponentRegistry,
  A2UIComponent,
  PropertyMeta,
  NotificationOptions,
  ModalOptions,
};

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
