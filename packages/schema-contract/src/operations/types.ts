import type { JsonValue } from '../types/json';

/**
 * M1b-1 只读数据源宿主执行契约（PR B / ADR-0005）。
 *
 * 本模块只承载「宿主 ↔ 服务端执行端点」的纯数据协议：请求形状、
 * 结果/错误形状与冻结错误码。页面 Schema（含 `logic.dataSources` 声明）
 * 的契约在 `types/` 与 `validation/`，两者不混用：
 * - 声明描述「页面引用了哪个 Operation、参数如何映射」；
 * - 请求携带「宿主求值并冻结后的参数快照」，服务端不二次求值模板。
 */
export const DATA_SOURCE_EXECUTION_ERROR_CODES = Object.freeze({
  /** operationId/revision 精确二元组不在可信注册表中（前置拒绝，上游计数 0） */
  UNKNOWN_OPERATION: 'UNKNOWN_OPERATION',
  /** 缺身份适配器、身份不可信或未授予操作权限（前置拒绝，上游计数 0） */
  FORBIDDEN: 'FORBIDDEN',
  /** data-source 能力未获当前部署授权（前置拒绝，上游计数 0） */
  CAPABILITY_DENIED: 'CAPABILITY_DENIED',
  /** 请求形状/参数不合法：未知字段、非法 sourceId 引用、参数契约不过（前置拒绝，上游计数 0） */
  INVALID_PARAMS: 'INVALID_PARAMS',
  /** 上游已响应但输出不合法：体积/深度/JSON/结果契约（请求已发生，不可宣称零调用） */
  INVALID_RESULT: 'INVALID_RESULT',
  /** 服务端独立截止时间超时（请求已发出并中止） */
  TIMEOUT: 'TIMEOUT',
  /** 传输层失败：连接拒绝、非 2xx、重定向等（请求已尝试） */
  UPSTREAM_FAILURE: 'UPSTREAM_FAILURE',
  /** 页面并发准入被拒（前置拒绝，上游计数 0） */
  EXECUTION_BUSY: 'EXECUTION_BUSY',
} as const);

export type DataSourceExecutionErrorCode =
  (typeof DATA_SOURCE_EXECUTION_ERROR_CODES)[keyof typeof DATA_SOURCE_EXECUTION_ERROR_CODES];

export function isDataSourceExecutionErrorCode(
  value: unknown,
): value is DataSourceExecutionErrorCode {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(DATA_SOURCE_EXECUTION_ERROR_CODES, value)
  );
}

/**
 * 宿主执行请求（纯数据；AbortSignal 属传输层，不进入该类型）。
 *
 * - `pageId`/`pageVersion`/`sourceId` 用于定位受授权的已保存快照并解析
 *   `logic.dataSources[sourceId]` 声明；页面标识不是凭据，身份来自服务端
 *   可信适配器，不在请求中携带。
 * - `params` 是宿主按声明映射求值后冻结的参数快照；服务端只按 Operation
 *   输入契约校验，绝不求值 `{{ }}` 模板，也绝不从 params 读取任何安全范围。
 */
export interface DataSourceExecutionRequest {
  readonly pageId: string;
  readonly pageVersion: number;
  readonly sourceId: string;
  readonly params?: Readonly<Record<string, JsonValue>>;
}

/**
 * 宿主服务执行输入（M1b-1 PR C）：Renderer/编译产物只携带 sourceId 与
 * 已求值冻结的参数快照；`pageId`/`pageVersion` 绑定由宿主适配器构造
 * `DataSourceExecutionRequest` 时补充（页面身份与发布引用是宿主配置，
 * 生成模块不携带）。形状是 `DataSourceExecutionRequest` 的严格子集。
 */
export interface DataSourceHostExecuteInput {
  readonly sourceId: string;
  readonly params?: Readonly<Record<string, JsonValue>>;
}

export interface DataSourceExecutionSuccess {
  readonly ok: true;
  /** 通过 Operation 输出契约校验后的完整公开 JSON 结果 */
  readonly result: JsonValue;
  readonly operationId: string;
  readonly revision: string;
  readonly traceId: string;
}

export interface DataSourceExecutionFailure {
  readonly ok: false;
  readonly code: DataSourceExecutionErrorCode;
  /** 安全消息：不包含上游 URL、端口、凭据或上游堆栈 */
  readonly message: string;
  readonly traceId: string;
}

export type DataSourceExecutionOutcome = DataSourceExecutionSuccess | DataSourceExecutionFailure;

/**
 * 宿主侧执行限额（服务端可信注册的每 Operation 默认值）。
 *
 * 只允许宿主向下调整（deadline 缩短、体积/深度收紧），任何来源的放大值
 * 都必须在服务端拒绝；页面 Schema 与客户端请求无法影响这些值。
 */
export interface DataSourceExecutionLimits {
  /** 单请求服务端独立截止时间（毫秒） */
  readonly deadlineMs: number;
  /** 单响应最大字节数（流式读取中强制，超限即中止连接） */
  readonly maxResponseBytes: number;
  /** 响应 JSON 最大嵌套深度（流式扫描中强制） */
  readonly maxJsonDepth: number;
}
