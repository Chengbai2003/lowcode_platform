import { HttpException, HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  DATA_SOURCE_EXECUTION_ERROR_CODES,
  evaluatePageSchemaCapabilities,
  validateDataSourceExecutionRequest,
  type DataSourceExecutionErrorCode,
  type DataSourceExecutionLimits,
  type DataSourceExecutionRequest,
  type DataSourceExecutionSuccess,
  type JsonValue,
} from '@lowcode-platform/schema-contract';
import * as crypto from 'crypto';
import { PageSchemaService } from '../page-schema/page-schema.service';
import { DataSourceExecutor } from './data-source-executor';
import {
  DataSourceIdentityAdapter,
  type TrustedDataSourceIdentity,
} from './data-source-identity.adapter';
import {
  DATA_SOURCE_UPSTREAM_TARGETS,
  EMPTY_UPSTREAM_TARGETS,
  resolveUpstreamTarget,
  type UpstreamTargetBindings,
} from './upstream-targets.provider';
import { findTrustedOperation } from './trusted-operation-registry';

const ERROR_STATUS_BY_CODE: Readonly<Record<DataSourceExecutionErrorCode, number>> = Object.freeze({
  [DATA_SOURCE_EXECUTION_ERROR_CODES.UNKNOWN_OPERATION]: HttpStatus.NOT_FOUND,
  [DATA_SOURCE_EXECUTION_ERROR_CODES.FORBIDDEN]: HttpStatus.FORBIDDEN,
  [DATA_SOURCE_EXECUTION_ERROR_CODES.CAPABILITY_DENIED]: HttpStatus.FORBIDDEN,
  [DATA_SOURCE_EXECUTION_ERROR_CODES.INVALID_PARAMS]: HttpStatus.BAD_REQUEST,
  [DATA_SOURCE_EXECUTION_ERROR_CODES.INVALID_RESULT]: HttpStatus.BAD_GATEWAY,
  [DATA_SOURCE_EXECUTION_ERROR_CODES.TIMEOUT]: HttpStatus.GATEWAY_TIMEOUT,
  [DATA_SOURCE_EXECUTION_ERROR_CODES.UPSTREAM_FAILURE]: HttpStatus.BAD_GATEWAY,
  [DATA_SOURCE_EXECUTION_ERROR_CODES.EXECUTION_BUSY]: HttpStatus.TOO_MANY_REQUESTS,
});

export class DataSourceExecutionError extends HttpException {
  constructor(
    readonly code: DataSourceExecutionErrorCode,
    message: string,
    readonly traceId: string,
  ) {
    super({ code, message, traceId }, ERROR_STATUS_BY_CODE[code]);
  }
}

/** 宿主限额覆盖：只允许向下调整（有效值 = min(注册默认, 覆盖值)） */
export type DataSourceLimitOverrides = Partial<DataSourceExecutionLimits>;

const DEFAULT_MAX_IN_FLIGHT_PER_PAGE = 4;

function positiveIntegerOrThrow(field: string, value: unknown): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(
      `Invalid DataSource limit override "${field}": expected a positive integer, received ${String(value)}`,
    );
  }
}

/**
 * 可信只读数据源执行服务（M1b-1 PR B）。
 *
 * 执行顺序固定，前置拒绝全部发生在任何上游请求之前（上游计数为 0）：
 * 请求形状 → 页面快照（404）→ 能力门禁 → 声明解析 → Operation 注册解析 →
 * 身份与权限 → 目标绑定 → 输入契约 → 并发准入 → 唯一 Executor → 输出契约。
 * 上游已响应后的失败（INVALID_RESULT/TIMEOUT/UPSTREAM_FAILURE）不宣称零调用。
 */
@Injectable()
export class DataSourceExecutionService implements OnModuleInit {
  private readonly logger = new Logger(DataSourceExecutionService.name);
  private readonly inFlightByPage = new Map<string, number>();
  private readonly limitOverrides: DataSourceLimitOverrides;

  constructor(
    private readonly pageSchemaService: PageSchemaService,
    private readonly identityAdapter: DataSourceIdentityAdapter,
    private readonly executor: DataSourceExecutor,
    private readonly upstreamTargets: UpstreamTargetBindings = EMPTY_UPSTREAM_TARGETS,
    private readonly maxInFlightPerPage: number = DEFAULT_MAX_IN_FLIGHT_PER_PAGE,
    limitOverrides: DataSourceLimitOverrides = {},
  ) {
    for (const [field, value] of Object.entries(limitOverrides)) {
      positiveIntegerOrThrow(field, value);
    }
    this.limitOverrides = { ...limitOverrides };
  }

  onModuleInit(): void {
    if (
      typeof this.maxInFlightPerPage !== 'number' ||
      !Number.isSafeInteger(this.maxInFlightPerPage) ||
      this.maxInFlightPerPage < 1
    ) {
      throw new TypeError(
        `Invalid maxInFlightPerPage: expected a positive integer, received ${String(this.maxInFlightPerPage)}`,
      );
    }
  }

  private effectiveLimits(registered: DataSourceExecutionLimits): DataSourceExecutionLimits {
    return {
      deadlineMs: Math.min(
        registered.deadlineMs,
        this.limitOverrides.deadlineMs ?? Number.MAX_SAFE_INTEGER,
      ),
      maxResponseBytes: Math.min(
        registered.maxResponseBytes,
        this.limitOverrides.maxResponseBytes ?? Number.MAX_SAFE_INTEGER,
      ),
      maxJsonDepth: Math.min(
        registered.maxJsonDepth,
        this.limitOverrides.maxJsonDepth ?? Number.MAX_SAFE_INTEGER,
      ),
    };
  }

  private fail(code: DataSourceExecutionErrorCode, message: string, traceId: string): never {
    throw new DataSourceExecutionError(code, message, traceId);
  }

  async execute(rawRequest: unknown): Promise<DataSourceExecutionSuccess> {
    const traceId = crypto.randomUUID();

    // 1. 请求形状（不可信输入；未知字段/非法参数 → INVALID_PARAMS）
    const validated = validateDataSourceExecutionRequest(rawRequest);
    if (!validated.ok) {
      const detail = validated.issues
        .map((issue) => `[${issue.path.join('.')}] ${issue.message}`)
        .join('; ');
      this.fail(
        DATA_SOURCE_EXECUTION_ERROR_CODES.INVALID_PARAMS,
        `Invalid data source execution request: ${detail}`,
        traceId,
      );
    }
    const request: DataSourceExecutionRequest = validated.value;

    // 2. 受授权页面版本：服务端回读已保存快照（pageId 不是凭据，仅定位）
    const snapshot = await this.pageSchemaService.getSchema(request.pageId, request.pageVersion);

    // 3. 能力门禁：当前部署可信清单评估（data-source 未放行 → CAPABILITY_DENIED）
    const capability = evaluatePageSchemaCapabilities(snapshot.schema);
    if (!capability.ok) {
      const first = capability.issues[0];
      this.fail(
        DATA_SOURCE_EXECUTION_ERROR_CODES.CAPABILITY_DENIED,
        `Data source execution is not granted by this deployment: ${first ? first.message : 'capability denied'}`,
        traceId,
      );
    }

    // 4. 声明解析：sourceId 必须指向该快照 logic.dataSources 的已声明条目
    const declaration = snapshot.schema.logic?.dataSources?.[request.sourceId];
    if (!declaration) {
      this.fail(
        DATA_SOURCE_EXECUTION_ERROR_CODES.INVALID_PARAMS,
        `sourceId "${request.sourceId}" is not declared in page ${request.pageId} version ${request.pageVersion}`,
        traceId,
      );
    }

    // 5. Operation 解析：精确 (operationId, revision) 命中可信注册；浮动 revision 天然失配
    const operation = findTrustedOperation(
      declaration.operationRef.operationId,
      declaration.operationRef.revision,
    );
    if (!operation) {
      this.fail(
        DATA_SOURCE_EXECUTION_ERROR_CODES.UNKNOWN_OPERATION,
        `Operation ${declaration.operationRef.operationId} @ revision "${declaration.operationRef.revision}" is not registered`,
        traceId,
      );
    }

    // 6. 身份：缺适配器/身份不可信/页面级拒绝 → FORBIDDEN（确定性，无匿名放行）
    const identity: TrustedDataSourceIdentity | undefined =
      await this.identityAdapter.resolveIdentity({
        pageId: request.pageId,
        pageVersion: request.pageVersion,
        sourceId: request.sourceId,
      });
    if (!identity) {
      this.fail(
        DATA_SOURCE_EXECUTION_ERROR_CODES.FORBIDDEN,
        'No trusted identity is available for data source execution',
        traceId,
      );
    }

    // 7. 权限：操作权限来自注册，身份权限来自可信适配器；params 无法授予
    if (!identity.grantedPermissions.has(operation.requiredPermission)) {
      this.fail(
        DATA_SOURCE_EXECUTION_ERROR_CODES.FORBIDDEN,
        'Identity is not permitted to execute this operation',
        traceId,
      );
    }

    // 8. 目标绑定：只来自可信配置并受注册约束（loopback-only 强制）；未配置即拒绝
    const target = resolveUpstreamTarget(operation, this.upstreamTargets);
    if (!target) {
      this.fail(
        DATA_SOURCE_EXECUTION_ERROR_CODES.FORBIDDEN,
        'Operation target is not configured in this deployment',
        traceId,
      );
    }

    // 9. 输入契约：已求值参数按 Operation 注册的输入契约校验（安全范围不可由 params 覆盖）
    const params = request.params ?? {};
    const paramsResult = operation.validateParams(params);
    if (paramsResult.issues.length > 0) {
      const detail = paramsResult.issues
        .map((issue) => `[${issue.path.join('.')}] ${issue.message}`)
        .join('; ');
      this.fail(
        DATA_SOURCE_EXECUTION_ERROR_CODES.INVALID_PARAMS,
        `Params do not match operation input contract: ${detail}`,
        traceId,
      );
    }

    // 10. 并发准入：同页面上游并发上限，超出即 EXECUTION_BUSY（该请求零上游调用）
    const inFlight = this.inFlightByPage.get(request.pageId) ?? 0;
    if (inFlight >= this.maxInFlightPerPage) {
      this.fail(
        DATA_SOURCE_EXECUTION_ERROR_CODES.EXECUTION_BUSY,
        `Page ${request.pageId} already has ${inFlight} data source executions in flight`,
        traceId,
      );
    }
    this.inFlightByPage.set(request.pageId, inFlight + 1);

    try {
      // 11. 唯一 Executor：截止时间/字节/深度限额在流读取中强制
      const outcome = await this.executor.execute({
        target,
        method: operation.transport.method,
        query: serializeQuery(params),
        limits: this.effectiveLimits(operation.limits),
      });
      if (outcome.status === 'failure') {
        this.fail(outcome.code, outcome.reason, traceId);
      }

      // 12. 输出契约：上游已响应（不可宣称零调用），不合法即拒绝且不提交。
      // 违规详情（字段名/路径来自不可信上游内容）只进服务端日志，
      // 客户端只收固定安全消息，避免泄露上游内部字段名
      const outputResult = operation.validateOutput(outcome.json);
      if (outputResult.issues.length > 0) {
        const detail = outputResult.issues
          .map((issue) => `[${issue.path.join('.')}] ${issue.message}`)
          .join('; ');
        this.logger.warn(`Output contract violation [trace ${traceId}]: ${detail}`);
        this.fail(
          DATA_SOURCE_EXECUTION_ERROR_CODES.INVALID_RESULT,
          'Upstream result does not match the operation output contract',
          traceId,
        );
      }

      return {
        ok: true,
        result: outcome.json as JsonValue,
        operationId: operation.operationId,
        revision: operation.revision,
        traceId,
      };
    } finally {
      const current = (this.inFlightByPage.get(request.pageId) ?? 1) - 1;
      if (current > 0) {
        this.inFlightByPage.set(request.pageId, current);
      } else {
        this.inFlightByPage.delete(request.pageId);
      }
    }
  }
}

/** GET 查询串序列化：仅标量；契约之外的形态已在输入契约处拒绝 */
function serializeQuery(params: Readonly<Record<string, JsonValue>>): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      query[key] = value;
    } else if (typeof value === 'number') {
      query[key] = String(value);
    } else if (typeof value === 'boolean') {
      query[key] = value ? 'true' : 'false';
    }
  }
  return query;
}

export { DATA_SOURCE_UPSTREAM_TARGETS, EMPTY_UPSTREAM_TARGETS };
