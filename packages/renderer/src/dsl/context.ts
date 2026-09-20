/**
 * 值类型：可以是静态值或表达式
 */
import type { JsonValue } from '@lowcode-platform/schema-contract';
import type {
  DataSourceExecutionOutcome,
  DataSourceHostExecuteInput,
} from '@lowcode-platform/schema-contract';

/**
 * 只读数据源宿主服务接口（M1b-1 PR C）：executeDataSource 动作的唯一
 * 网络出口。绝不 fallback 到 fetch / context.api / apiCall。
 */
export interface DataSourceHostService {
  execute(
    input: DataSourceHostExecuteInput,
    signal?: AbortSignal,
  ): Promise<DataSourceExecutionOutcome>;
}

export type Value =
  | string
  | number
  | boolean
  | null
  | undefined
  | Record<string, unknown>
  | unknown[]
  // Contract canonical Schema 中的只读 JSON 值（Issue #16 / M0-1 对齐）
  | JsonValue;

// 前向声明 ReactiveRuntime 类型，避免循环依赖
import type { ReactiveRuntime } from '../reactive';

/**
 * 模态框配置选项
 */
export interface ModalOptions {
  title?: string;
  content?: string;
  okText?: string;
  cancelText?: string;
  [key: string]: unknown;
}

/**
 * 通知配置选项
 */
export interface NotificationOptions {
  message?: string;
  description?: string;
  duration?: number;
  placement?: 'top' | 'topLeft' | 'topRight' | 'bottom' | 'bottomLeft' | 'bottomRight';
  [key: string]: unknown;
}

/**
 * API 请求配置
 */
export interface ApiRequestConfig {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  params?: Record<string, unknown>;
  data?: unknown;
  timeout?: number;
  signal?: AbortSignal;
  [key: string]: unknown;
}

/**
 * Tab 打开选项
 */
export interface OpenTabOptions {
  id: string;
  title: string;
  path: string;
  closeOthers?: boolean;
}

/**
 * 执行上下文
 * 提供给Action执行时使用的运行时数据
 */
export interface ExecutionContext {
  // 组件数据
  data: Record<string, unknown>;

  // 表单数据
  formData: Record<string, unknown>;

  // 当前用户信息
  user: {
    id: string;
    name: string;
    roles: string[];
    permissions: string[];
    [key: string]: unknown;
  };

  // 路由信息
  route: {
    path: string;
    query: Record<string, string>;
    params: Record<string, string>;
  };

  // 全局状态
  state: Record<string, unknown>;

  // 由 State 派生的只读 Computed 命名空间
  computed: Readonly<Record<string, unknown>>;

  // Host dispatch hook（可选）
  dispatch?: (action: unknown) => void;

  // Host state hook（可选）
  getState?: () => unknown;

  // 事件对象
  event?: Event | unknown;

  // 工具函数
  utils: {
    // 格式化日期
    formatDate: (date: Date | string, format?: string) => string;
    // 生成UUID
    uuid: () => string;
    // 深拷贝
    clone: <T>(obj: T) => T;
    // 防抖
    debounce: <T extends (...args: unknown[]) => unknown>(fn: T, delay: number) => T;
    // 节流
    throttle: <T extends (...args: unknown[]) => unknown>(fn: T, delay: number) => T;
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
      confirm: (options: ModalOptions) => Promise<boolean>;
      info: (options: ModalOptions) => Promise<void>;
      success: (options: ModalOptions) => Promise<void>;
      error: (options: ModalOptions) => Promise<void>;
      warning: (options: ModalOptions) => Promise<void>;
    };
    notification: {
      success: (options: NotificationOptions) => void;
      error: (options: NotificationOptions) => void;
      warning: (options: NotificationOptions) => void;
      info: (options: NotificationOptions) => void;
    };
    openTab?: (options: OpenTabOptions) => void;
  };

  // API客户端
  api: {
    get: <T = unknown>(
      url: string,
      params?: Record<string, unknown>,
      signal?: AbortSignal,
    ) => Promise<T>;
    post: <T = unknown>(url: string, data?: unknown, signal?: AbortSignal) => Promise<T>;
    put: <T = unknown>(url: string, data?: unknown, signal?: AbortSignal) => Promise<T>;
    delete: <T = unknown>(url: string, signal?: AbortSignal) => Promise<T>;
    request: <T = unknown>(config: ApiRequestConfig) => Promise<T>;
  };

  /**
   * 只读数据源宿主服务（M1b-1 PR C / ADR-0005）。
   *
   * 与 `context.api` 同层的宿主显式注入位：executeDataSource 动作要求
   * `hostCapabilities.dataResources` 已授予 **且** 本服务存在，二者缺一
   * fail-close（零宿主调用）。宿主实现负责 pageId/pageVersion 绑定并调用
   * B 阶段执行端点；Renderer/生成代码只携带 sourceId 与已求值冻结的参数。
   */
  dataSources?: DataSourceHostService;

  // 导航
  navigate: (path: string, params?: Record<string, unknown>) => void;
  back: () => void;

  // 当前 schema 组件池（componentId -> component）
  components: Record<string, unknown>;

  /**
   * ReactiveRuntime 引用，renderer runtime 的唯一真相源
   */
  runtime: ReactiveRuntime;

  // 自定义扩展数据
  [key: string]: unknown;
}

/**
 * Action处理器函数签名
 */
export type ActionHandler = (
  action: unknown,
  context: ExecutionContext,
  executor?: unknown,
) => Promise<unknown>;

/**
 * Action注册表
 */
export type ActionRegistry = Record<string, ActionHandler>;
