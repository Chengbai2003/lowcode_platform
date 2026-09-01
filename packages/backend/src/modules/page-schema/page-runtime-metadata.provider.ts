import { Injectable } from '@nestjs/common';
import type { RuntimeCompatibility } from '@lowcode-platform/schema-contract';
import { BUILTIN_ANTD_RUNTIME_PROFILE } from './runtime-profiles';

export interface PageRuntimeMetadata {
  /** 页面所属系统（M0 固定 default）；不属于 RuntimeCompatibility，不进入快照元数据 */
  systemId: string;
  /** 严格符合 Contract RuntimeCompatibility 的快照元数据 */
  runtimeCompatibility: RuntimeCompatibility;
}

/**
 * 页面运行时元数据提供者（Service 层，不进入 Repository）。
 *
 * 返回服务端可信的内置运行时三元组：元数据由服务端写入存储，
 * Agent 与客户端不可自报（ADR-0001 / Issue #16 决策）。
 */
@Injectable()
export class PageRuntimeMetadataProvider {
  getDraftPageRuntimeMetadata(): PageRuntimeMetadata {
    return {
      systemId: 'default',
      runtimeCompatibility: BUILTIN_ANTD_RUNTIME_PROFILE,
    };
  }
}
