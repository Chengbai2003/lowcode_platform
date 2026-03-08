/**
 * 值类型：可以是静态值或表达式
 */
export type Value = string | number | boolean | null | undefined | Record<string, any> | any[];

/**
 * 执行上下文
 * 提供给Action执行时使用的运行时数据
 */
export interface ExecutionContext {
  // 组件数据
  data: Record<string, any>;

  // 表单数据
  formData: Record<string, any>;

  // 当前用户信息
  user: {
    id: string;
    name: string;
    roles: string[];
    permissions: string[];
    [key: string]: any;
  };

  // 路由信息
  route: {
    path: string;
    query: Record<string, string>;
    params: Record<string, string>;
  };

  // 全局状态
  state: Record<string, any>;

  // Redux dispatch
  dispatch: (action: any) => void;

  // 获取Store状态
  getState: () => any;

  // 事件对象
  event?: Event | any;

  // 工具函数
  utils: {
    // 格式化日期
    formatDate: (date: Date | string, format?: string) => string;
    // 生成UUID
    uuid: () => string;
    // 深拷贝
    clone: <T>(obj: T) => T;
    // 防抖
    debounce: <T extends (...args: any[]) => any>(fn: T, delay: number) => T;
    // 节流
    throttle: <T extends (...args: any[]) => any>(fn: T, delay: number) => T;
  };

  // UI操作
  ui: {
    message: {
      success: (content: string) => void;
      error: (content: string) => void;
      warning: (content: string) => void;
      info: (content: string) => void;
    };
    modal: {
      confirm: (options: any) => Promise<boolean>;
      info: (options: any) => Promise<void>;
      success: (options: any) => Promise<void>;
      error: (options: any) => Promise<void>;
      warning: (options: any) => Promise<void>;
    };
    notification: {
      success: (options: any) => void;
      error: (options: any) => void;
      warning: (options: any) => void;
      info: (options: any) => void;
    };
    openTab?: (options: { id: string; title: any; path: any; closeOthers?: boolean }) => void;
  };

  // API客户端
  api: {
    get: <T = any>(url: string, params?: any) => Promise<T>;
    post: <T = any>(url: string, data?: any) => Promise<T>;
    put: <T = any>(url: string, data?: any) => Promise<T>;
    delete: <T = any>(url: string) => Promise<T>;
    request: <T = any>(config: any) => Promise<T>;
  };

  // 导航
  navigate: (path: string, params?: Record<string, any>) => void;
  back: () => void;

  // 自定义扩展数据
  [key: string]: any;
}

/**
 * Action处理器函数签名
 */
export type ActionHandler = (
  action: any,
  context: ExecutionContext,
  executor?: any,
) => Promise<any>;

/**
 * Action注册表
 */
export type ActionRegistry = Record<string, ActionHandler>;
