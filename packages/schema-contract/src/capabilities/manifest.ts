import { deepFreeze } from '../internal/freeze';
import {
  SCHEMA_CAPABILITIES,
  CONSUMER_SURFACES,
  REQUIRED_CAPABILITY_REVISION,
  type CapabilityManifest,
  type CapabilityMatrix,
  type CapabilitySupportStatus,
  type SchemaCapability,
  type ConsumerSurface,
} from './types';

/**
 * 生产可信能力显式登记表（M1b-1 起新增能力默认 unsupported）。
 *
 * 新增 SchemaCapability 必须在此登记，否则模块初始化即失败 —— 能力集合
 * 与支持状态不允许"追加名字即全量放行"的隐式默认。既有 M1a 三项能力的
 * 支持状态与 revision 保持不变（回归红线）。
 */
const TRUSTED_CAPABILITY_STATUSES: Readonly<Record<SchemaCapability, CapabilitySupportStatus>> =
  deepFreeze({
    'page-state': 'supported',
    'named-computed': 'supported',
    'action-flow': 'supported',
    // M1b-1 只读数据源：B/C/D/E 六消费面执行语义未交付、验收未通过前，
    // 任何消费面不得保存/执行/编译含 dataSources/executeDataSource 的页面
    'data-source': 'unsupported',
  });

for (const capability of SCHEMA_CAPABILITIES) {
  if (!Object.prototype.hasOwnProperty.call(TRUSTED_CAPABILITY_STATUSES, capability)) {
    throw new Error(
      `Trusted capability registry is missing an explicit status for "${capability}"; ` +
        'every SchemaCapability must be registered in TRUSTED_CAPABILITY_STATUSES',
    );
  }
}

/**
 * 构造随构建交付的生产可信能力矩阵（显式登记，新增能力默认拒绝）
 */
function buildTrustedCapabilityMatrix(): CapabilityMatrix {
  const matrix: Record<
    string,
    Record<string, { status: CapabilitySupportStatus; revision: number }>
  > = {};
  for (const cap of SCHEMA_CAPABILITIES) {
    const surfaceRecord: Record<string, { status: CapabilitySupportStatus; revision: number }> = {};
    for (const surface of CONSUMER_SURFACES) {
      surfaceRecord[surface] = {
        status: TRUSTED_CAPABILITY_STATUSES[cap],
        revision: REQUIRED_CAPABILITY_REVISION,
      };
    }
    matrix[cap] = surfaceRecord;
  }
  return matrix as unknown as CapabilityMatrix;
}

/**
 * 生产默认不可变可信能力清单（深度冻结）
 */
export const TRUSTED_CAPABILITY_MANIFEST: CapabilityManifest = deepFreeze({
  manifestVersion: 1,
  matrix: buildTrustedCapabilityMatrix(),
});

/**
 * 获取当前运行时生效的可信能力清单
 */
export function getTrustedCapabilityManifest(): CapabilityManifest {
  return TRUSTED_CAPABILITY_MANIFEST;
}

/**
 * 测试辅助：根据 overrides 构造测试矩阵（纯数据，不影响生产默认清单）
 */
export function createTestCapabilityMatrix(
  overrides?: Partial<{
    [C in SchemaCapability]?: Partial<{
      [S in ConsumerSurface]?: { status?: unknown; revision?: unknown } | null | unknown;
    }>;
  }>,
): CapabilityMatrix {
  const base = buildTrustedCapabilityMatrix() as unknown as Record<string, Record<string, unknown>>;
  if (!overrides) {
    return deepFreeze(base) as unknown as CapabilityMatrix;
  }
  for (const capKey of Object.keys(overrides)) {
    const cap = capKey as SchemaCapability;
    const surfaceOverrides = overrides[cap];
    if (surfaceOverrides === null || typeof surfaceOverrides !== 'object') {
      base[cap] = surfaceOverrides as unknown as Record<string, unknown>;
      continue;
    }
    if (!base[cap]) {
      base[cap] = {};
    }
    for (const surfaceKey of Object.keys(surfaceOverrides)) {
      const surface = surfaceKey as ConsumerSurface;
      const entryOverride = surfaceOverrides[surface];
      if (entryOverride === undefined) {
        delete base[cap][surface];
      } else {
        base[cap][surface] = entryOverride;
      }
    }
  }
  return deepFreeze(base) as unknown as CapabilityMatrix;
}
