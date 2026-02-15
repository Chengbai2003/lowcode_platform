/**
 * DSL（领域特定语言）类型定义
 * 用于低代码平台的事件处理和业务逻辑编排
 */

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
export type ActionHandler = (action: any, context: ExecutionContext, executor?: any) => Promise<any>;

/**
 * Action注册表
 */
export type ActionRegistry = Record<string, ActionHandler>;

/**
 * ============================================================================
 * DSL Action类型定义
 * ============================================================================
 */

/**
 * 数据操作 Actions
 */
export type SetFieldAction = {
  type: 'setField';
  /** 字段名，支持路径如 'user.name' */
  field: string;
  /** 要设置的值 */
  value: Value;
};

export type MergeFieldAction = {
  type: 'mergeField';
  /** 字段名 */
  field: string;
  /** 要合并的值 */
  value: Record<string, any>;
};

export type ClearFieldAction = {
  type: 'clearField';
  /** 字段名 */
  field: string;
};

/**
 * UI交互 Actions
 */
export type MessageAction = {
  type: 'message';
  /** 消息内容 */
  content: Value;
  /** 消息类型 */
  messageType?: 'success' | 'error' | 'warning' | 'info';
  /** 显示时长（秒） */
  duration?: number;
};

export type ModalAction = {
  type: 'modal';
  /** 标题 */
  title: Value;
  /** 内容 */
  content: Value;
  /** 确定时执行的Actions */
  onOk?: Action[];
  /** 取消时执行的Actions */
  onCancel?: Action[];
  /** 是否显示取消按钮 */
  showCancel?: boolean;
};

export type ConfirmAction = {
  type: 'confirm';
  /** 标题 */
  title?: Value;
  /** 确认内容 */
  content: Value;
  /** 确认时执行的Actions */
  onOk?: Action[];
  /** 取消时执行的Actions */
  onCancel?: Action[];
};

export type NotificationAction = {
  type: 'notification';
  /** 标题 */
  title: Value;
  /** 描述 */
  description?: Value;
  /** 消息类型 */
  messageType?: 'success' | 'error' | 'warning' | 'info';
  /** 持续时间 */
  duration?: number;
  /** 位置 */
  placement?: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
};

/**
 * 导航 Actions
 */
export type NavigateAction = {
  type: 'navigate';
  /** 跳转路径 */
  to: Value;
  /** 路径参数 */
  params?: Record<string, Value>;
  /** 是否替换当前历史记录 */
  replace?: boolean;
};

export type OpenTabAction = {
  type: 'openTab';
  /** 标签ID */
  id: string;
  /** 标签标题 */
  title: Value;
  /** 标签路径 */
  path: Value;
  /** 是否关闭其他标签 */
  closeOthers?: boolean;
};

export type CloseTabAction = {
  type: 'closeTab';
  /** 标签ID，不传则关闭当前标签 */
  id?: string;
};

export type BackAction = {
  type: 'back';
  /** 返回步数，默认1 */
  count?: number;
};

/**
 * 状态管理 Actions
 */
export type DispatchAction = {
  type: 'dispatch';
  /** Redux action对象 */
  action: Value;
};

export type SetStateAction = {
  type: 'setState';
  /** 要设置的状态 */
  state: Record<string, Value>;
};

export type ResetFormAction = {
  type: 'resetForm';
  /** 表单ID或表单名 */
  form: string;
};

/**
 * 异步操作 Actions
 */
export type ApiCallAction = {
  type: 'apiCall';
  /** 请求URL */
  url: Value;
  /** 请求方法 */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** 请求体 */
  body?: Value;
  /** 请求头 */
  headers?: Record<string, Value>;
  /** 查询参数 */
  params?: Record<string, Value>;
  /** 将结果保存到哪个字段 */
  resultTo?: string;
  /** 成功时执行的Actions */
  onSuccess?: Action[];
  /** 失败时执行的Actions */
  onError?: Action[];
  /** 是否显示错误提示 */
  showError?: boolean;
};

export type DelayAction = {
  type: 'delay';
  /** 延迟毫秒数 */
  ms: number;
};

export type WaitConditionAction = {
  type: 'waitCondition';
  /** 等待条件表达式 */
  condition: Value;
  /** 轮询间隔（毫秒） */
  interval?: number;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 超时时执行的Actions */
  onTimeout?: Action[];
};

/**
 * 流程控制 Actions
 */
export type IfAction = {
  type: 'if';
  /** 条件表达式 */
  condition: Value;
  /** 条件为真时执行的Actions */
  then: Action[];
  /** 条件为假时执行的Actions */
  else?: Action[];
};

export type SwitchAction = {
  type: 'switch';
  /** 要比较的值 */
  value: Value;
  /** 分支条件 */
  cases: Array<{
    /** 匹配值 */
    match: Value;
    /** 匹配时执行的Actions */
    actions: Action[];
  }>;
  /** 默认执行的Actions */
  default?: Action[];
};

export type LoopAction = {
  type: 'loop';
  /** 要遍历的数组 */
  over: Value;
  /** 循环变量的名字 */
  itemVar: string;
  /** 可选：索引变量名 */
  indexVar?: string;
  /** 循环体中执行的Actions */
  actions: Action[];
};

export type ParallelAction = {
  type: 'parallel';
  /** 并行执行的Actions */
  actions: Action[];
  /** 是否等待所有完成 */
  waitAll?: boolean;
};

export type SequenceAction = {
  type: 'sequence';
  /** 顺序执行的Actions（默认行为，显式声明更清晰） */
  actions: Action[];
};

export type TryCatchAction = {
  type: 'tryCatch';
  /** try块执行的Actions */
  try: Action[];
  /** catch块执行的Actions */
  catch: Action[];
  /** finally块执行的Actions */
  finally?: Action[];
};

/**
 * 调试 Actions
 */
export type LogAction = {
  type: 'log';
  /** 要打印的值 */
  value: Value;
  /** 日志级别 */
  level?: 'log' | 'info' | 'warn' | 'error';
};

export type DebugAction = {
  type: 'debug';
  /** 断点标签 */
  label?: string;
};

/**
 * 扩展点 Actions
 */

/**
 * 执行自定义JS代码（开发者扩展）
 * 会进行AST安全验证，然后在Web Worker中执行
 */
export type CustomScriptAction = {
  type: 'customScript';
  /** JS代码，格式为 async function(context) { ... } */
  code: string;
  /** 超时时间（毫秒） */
  timeout?: number;
};

/**
 * 执行自定义插件Action（插件扩展）
 */
export type CustomAction = {
  type: 'customAction';
  /** 插件名称 */
  plugin: string;
  /** 插件配置 */
  config: Record<string, any>;
};

/**
 * ============================================================================
 * 联合类型
 * ============================================================================
 */

/**
 * 所有支持的Action类型
 */
export type Action =
  // 数据操作
  | SetFieldAction
  | MergeFieldAction
  | ClearFieldAction
  // UI交互
  | MessageAction
  | ModalAction
  | ConfirmAction
  | NotificationAction
  // 导航
  | NavigateAction
  | OpenTabAction
  | CloseTabAction
  | BackAction
  // 状态管理
  | DispatchAction
  | SetStateAction
  | ResetFormAction
  // 异步操作
  | ApiCallAction
  | DelayAction
  | WaitConditionAction
  // 流程控制
  | IfAction
  | SwitchAction
  | LoopAction
  | ParallelAction
  | SequenceAction
  | TryCatchAction
  // 调试
  | LogAction
  | DebugAction
  // 扩展点
  | CustomScriptAction
  | CustomAction;

/**
 * Action列表
 */
export type ActionList = Action[];

/**
 * 事件定义
 */
export type EventDefinition = ActionList;

/**
 * 事件映射
 */
export type EventsMap = Record<string, EventDefinition>;

/**
 * ============================================================================
 * DSL配置选项
 * ============================================================================
 */

/**
 * DSL执行器配置
 */
export interface ExecutorOptions {
  /** 是否启用调试模式 */
  debug?: boolean;
  /** 最大执行时间（毫秒） */
  maxExecutionTime?: number;
  /** 是否启用自定义脚本 */
  enableCustomScript?: boolean;
  /** 是否启用插件系统 */
  enablePlugins?: boolean;
  /** 自定义处理器 */
  customHandlers?: ActionRegistry;
  /** 错误处理回调 */
  onError?: (error: Error, action: Action, context: ExecutionContext) => void;
  /** 日志输出回调 */
  onLog?: (level: string, message: string, data?: any) => void;
}

/**
 * ============================================================================
 * 表达式相关类型
 * ============================================================================
 */

/**
 * 表达式类型
 */
export type ExpressionType = 'literal' | 'variable' | 'template' | 'complex';

/**
 * 解析后的表达式
 */
export interface ParsedExpression {
  type: ExpressionType;
  raw: string;
  value?: any;
  variables?: string[];
  expression?: string;
}

/**
 * ============================================================================
 * 执行结果
 * ============================================================================
 */

/**
 * Action执行结果
 */
export interface ActionResult {
  /** 是否成功 */
  success: boolean;
  /** 返回值 */
  value?: any;
  /** 错误信息 */
  error?: Error;
  /** 执行耗时（毫秒） */
  duration?: number;
}

/**
 * 批量执行结果
 */
export interface BatchActionResult {
  /** 总Action数 */
  total: number;
  /** 成功数 */
  success: number;
  /** 失败数 */
  failed: number;
  /** 各Action的执行结果 */
  results: ActionResult[];
  /** 总耗时（毫秒） */
  duration: number;
}
