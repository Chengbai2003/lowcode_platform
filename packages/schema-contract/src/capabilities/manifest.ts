import { deepFreeze } from '../internal/freeze';
import {
  SCHEMA_CAPABILITIES,
  CONSUMER_SURFACES,
  REQUIRED_CAPABILITY_REVISION,
  type CapabilityManifest,
  type CapabilityMatrix,
  type SchemaCapability,
  type ConsumerSurface,
} from './types';

/**
 * 构造随构建交付的生产可信全支持矩阵
 */
function buildTrustedCapabilityMatrix(): CapabilityMatrix {
  const matrix: Record<string, Record<string, { status: 'supported'; revision: number }>> = {};
  for (const cap of SCHEMA_CAPABILITIES) {
    const surfaceRecord: Record<string, { status: 'supported'; revision: number }> = {};
    for (const surface of CONSUMER_SURFACES) {
      surfaceRecord[surface] = {
        status: 'supported',
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
