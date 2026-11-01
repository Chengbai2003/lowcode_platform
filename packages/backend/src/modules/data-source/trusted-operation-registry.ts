import type { DataSourceExecutionLimits, JsonValue } from '@lowcode-platform/schema-contract';

/**
 * 可信 Operation 注册项（M1b-1 PR B / ADR-0005）。
 *
 * 注册表是服务端静态可信数据：输入/输出契约、只读语义、权限策略与
 * 宿主限额全部来自注册，页面 Schema 与客户端请求只能提供
 * `{operationId, revision}` 精确引用与已求值参数，无法影响任何安全属性。
 */
export interface TrustedParamIssues {
  readonly issues: readonly { readonly path: readonly string[]; readonly message: string }[];
}

/**
 * 结构化参数契约（PR D）：Agent 目录与编辑器配置面的单一事实源。
 * `validateParams` 由该契约派生（createParamsValidator），
 * 不允许形成两份独立规则。
 */
export interface TrustedParamFieldContract {
  readonly type: 'string' | 'integer';
  readonly required: boolean;
  /** string 类型：最大长度（含） */
  readonly maxLength?: number;
  /** integer 类型：最小值（含） */
  readonly min?: number;
  /** integer 类型：最大值（含） */
  readonly max?: number;
}

export type TrustedParamsContract = Readonly<Record<string, TrustedParamFieldContract>>;

export interface TrustedOperationDefinition {
  /** 精确引用的 operationId（点分标识） */
  readonly operationId: string;
  /** 精确引用的 revision（不透明、非浮动） */
  readonly revision: string;
  /** 公开目录描述（仅展示，不含目标地址） */
  readonly title: string;
  readonly description: string;
  /** 只读语义来自可信注册本身，绝不由 HTTP 方法推断 */
  readonly kind: 'readonly-query';
  /** 执行所需权限；身份来自服务端可信适配器，params 无法授予 */
  readonly requiredPermission: string;
  /** 输入契约的结构化描述（目录/配置面公开；validateParams 的唯一来源） */
  readonly paramsContract: TrustedParamsContract;
  /** 宿主限额默认值：可信宿主只可下调，不可放宽 */
  readonly limits: DataSourceExecutionLimits;
  /** 上游目标约束：demo 操作只允许 loopback，任何部署不得指向公网 */
  readonly targetConstraint: 'loopback-only';
  /** 传输形态：GET + 查询串（参数已按输入契约校验后序列化） */
  readonly transport: { readonly method: 'GET' };
  /** 输入契约：只接受白名单键，逐键类型/边界校验（由 paramsContract 派生） */
  validateParams(value: Readonly<Record<string, JsonValue>>): TrustedParamIssues;
  /** 输出契约：结构、字段白名单、记录数与节点预算 */
  validateOutput(value: unknown): TrustedParamIssues;
}

export type ValidateParamsResult = TrustedParamIssues;

/**
 * 由结构化契约派生输入校验器（PR D 单一事实源）。
 * 诊断消息与既有内联实现保持逐字一致（行为回归红线）。
 */
export function createParamsValidator(
  operationId: string,
  contract: TrustedParamsContract,
): (value: Readonly<Record<string, JsonValue>>) => TrustedParamIssues {
  return (value: Readonly<Record<string, JsonValue>>): TrustedParamIssues => {
    const issues: { path: readonly string[]; message: string }[] = [];
    for (const key of Object.keys(value)) {
      if (!Object.prototype.hasOwnProperty.call(contract, key)) {
        issues.push(paramIssue(['params', key], `Unknown param "${key}" for ${operationId}`));
      }
    }
    for (const key of Object.keys(contract)) {
      const field = contract[key];
      const raw = Object.getOwnPropertyDescriptor(value, key);
      const fieldValue = raw ? raw.value : undefined;
      if (fieldValue === undefined) {
        if (field.required) {
          issues.push(paramIssue(['params', key], `Param "${key}" is required`));
        }
        continue;
      }
      if (field.type === 'string') {
        if (typeof fieldValue !== 'string') {
          issues.push(paramIssue(['params', key], `Param "${key}" must be a string`));
        } else if (field.maxLength !== undefined && fieldValue.length > field.maxLength) {
          issues.push(
            paramIssue(
              ['params', key],
              `Param "${key}" length (${fieldValue.length}) exceeded limit of ${field.maxLength}`,
            ),
          );
        }
        continue;
      }
      const min = field.min === undefined ? Number.NEGATIVE_INFINITY : field.min;
      const max = field.max === undefined ? Number.POSITIVE_INFINITY : field.max;
      if (
        typeof fieldValue !== 'number' ||
        !Number.isSafeInteger(fieldValue) ||
        fieldValue < min ||
        fieldValue > max
      ) {
        issues.push(
          paramIssue(
            ['params', key],
            `Param "${key}" must be an integer between ${min} and ${max}`,
          ),
        );
      }
    }
    return { issues };
  };
}

const MAX_QUERY_LENGTH = 128;
const MAX_ITEM_ID_LENGTH = 64;
const MAX_ITEM_TITLE_LENGTH = 256;
const MAX_ITEMS = 100;
const MAX_OUTPUT_NODES = 5_000;

function paramIssue(
  path: readonly string[],
  message: string,
): { readonly path: readonly string[]; readonly message: string } {
  return { path, message };
}

/**
 * 唯一注册的只读示例操作：`demo.items.search` @ revision `1`。
 *
 * 该操作是隔离演示/测试操作：目标只能由可信宿主配置解析到 loopback，
 * 生产默认配置不提供目标（未配置即 FORBIDDEN，绝不落到公网默认例外）。
 */
const DEMO_ITEMS_SEARCH_PARAMS_CONTRACT: TrustedParamsContract = Object.freeze({
  query: Object.freeze({ type: 'string', required: false, maxLength: MAX_QUERY_LENGTH }),
  limit: Object.freeze({ type: 'integer', required: false, min: 1, max: 50 }),
});

const DEMO_ITEMS_SEARCH: TrustedOperationDefinition = Object.freeze({
  operationId: 'demo.items.search',
  revision: '1',
  title: 'Demo Items Search',
  description: 'Read-only demo item search backed by an isolated loopback service.',
  kind: 'readonly-query',
  requiredPermission: 'data-source:demo.items.search:execute',
  paramsContract: DEMO_ITEMS_SEARCH_PARAMS_CONTRACT,
  limits: Object.freeze({
    deadlineMs: 10_000,
    maxResponseBytes: 1024 * 1024,
    maxJsonDepth: 32,
  }),
  targetConstraint: 'loopback-only',
  transport: Object.freeze({ method: 'GET' }),

  validateParams: createParamsValidator('demo.items.search', DEMO_ITEMS_SEARCH_PARAMS_CONTRACT),

  validateOutput(value: unknown): TrustedParamIssues {
    const issues: { path: readonly string[]; message: string }[] = [];
    let nodeCount = 0;
    const countNode = (): boolean => {
      nodeCount += 1;
      if (nodeCount > MAX_OUTPUT_NODES) {
        issues.push(
          paramIssue(['result'], `Result node count exceeded limit of ${MAX_OUTPUT_NODES}`),
        );
        return false;
      }
      return true;
    };

    const validateItem = (item: unknown, index: number): void => {
      if (!countNode()) return;
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        issues.push(paramIssue(['result', 'items', String(index)], 'Each item must be an object'));
        return;
      }
      const record = item as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        if (key !== 'id' && key !== 'title' && key !== 'price') {
          issues.push(
            paramIssue(['result', 'items', String(index), key], `Unknown item field "${key}"`),
          );
        }
      }
      if (typeof record.id !== 'string' || !record.id || record.id.length > MAX_ITEM_ID_LENGTH) {
        issues.push(
          paramIssue(
            ['result', 'items', String(index), 'id'],
            `Item "id" must be a non-empty string within ${MAX_ITEM_ID_LENGTH} chars`,
          ),
        );
      } else if (!countNode()) return;
      if (typeof record.title !== 'string' || record.title.length > MAX_ITEM_TITLE_LENGTH) {
        issues.push(
          paramIssue(
            ['result', 'items', String(index), 'title'],
            `Item "title" must be a string within ${MAX_ITEM_TITLE_LENGTH} chars`,
          ),
        );
      } else if (!countNode()) return;
      const price = record.price;
      if (price !== undefined) {
        if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
          issues.push(
            paramIssue(
              ['result', 'items', String(index), 'price'],
              'Item "price" must be a finite non-negative number',
            ),
          );
        } else if (!countNode()) return;
      }
    };

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { issues: [paramIssue(['result'], 'Result must be an object')] };
    }
    if (!countNode()) return { issues };
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (key !== 'items') {
        issues.push(paramIssue(['result', key], `Unknown result field "${key}"`));
      }
    }
    const items = record.items;
    if (!Array.isArray(items)) {
      issues.push(paramIssue(['result', 'items'], 'Result field "items" must be an array'));
      return { issues };
    }
    if (items.length > MAX_ITEMS) {
      issues.push(
        paramIssue(
          ['result', 'items'],
          `Result items count (${items.length}) exceeded limit of ${MAX_ITEMS}`,
        ),
      );
      return { issues };
    }
    for (let i = 0; i < items.length; i += 1) {
      validateItem(items[i], i);
    }
    return { issues };
  },
});

/**
 * 静态可信注册表：精确 (operationId, revision) 二元组 → 定义。
 * 浮动 revision（latest/*）在此结构上天然无法命中。
 */
const TRUSTED_OPERATIONS: readonly TrustedOperationDefinition[] = Object.freeze([
  DEMO_ITEMS_SEARCH,
]);

export function findTrustedOperation(
  operationId: string,
  revision: string,
): TrustedOperationDefinition | undefined {
  return TRUSTED_OPERATIONS.find(
    (entry) => entry.operationId === operationId && entry.revision === revision,
  );
}

export function listTrustedOperationSummaries(): readonly {
  readonly operationId: string;
  readonly revision: string;
  readonly title: string;
  readonly description: string;
  readonly kind: TrustedOperationDefinition['kind'];
  readonly paramsContract: TrustedParamsContract;
}[] {
  return TRUSTED_OPERATIONS.map((entry) => ({
    operationId: entry.operationId,
    revision: entry.revision,
    title: entry.title,
    description: entry.description,
    kind: entry.kind,
    paramsContract: entry.paramsContract,
  }));
}

/** 目录过滤用的内部全量定义访问（含 requiredPermission，不对外暴露） */
export function listTrustedOperationDefinitions(): readonly TrustedOperationDefinition[] {
  return TRUSTED_OPERATIONS;
}
