import { Injectable, Optional, BadRequestException } from '@nestjs/common';
import type { RuntimeCompatibility } from '@lowcode-platform/schema-contract';
import {
  DEPLOYMENT_RUNTIME_PROFILE_REGISTRY,
  DeploymentRuntimeProfileRegistry,
} from '../runtime-profile/deployment-runtime-profile-registry';
import { toRuntimeCompatibility } from './system-runtime-profile';

export interface PageRuntimeMetadata {
  /** 页面所属系统（M0 固定 default）；不属于 RuntimeCompatibility，不进入快照元数据 */
  systemId: string;
  /** 严格符合 Contract RuntimeCompatibility 的快照元数据 */
  runtimeCompatibility: RuntimeCompatibility;
}

/**
 * 页面运行时元数据提供者（Service 层，不进入 Repository）。
 *
 * 返回服务端可信的运行时 Profile：元数据由服务端写入存储，
 * Agent 与客户端不可自报（ADR-0001 / ADR-0006 决策）。
 */
@Injectable()
export class PageRuntimeMetadataProvider {
  private readonly deploymentRegistry: DeploymentRuntimeProfileRegistry;

  constructor(@Optional() deploymentRegistry?: DeploymentRuntimeProfileRegistry) {
    this.deploymentRegistry = deploymentRegistry ?? DEPLOYMENT_RUNTIME_PROFILE_REGISTRY;
  }

  /**
   * 默认系统的 active Profile（用于未保存草稿与测试兼容）。
   */
  getDraftPageRuntimeMetadata(): PageRuntimeMetadata {
    return this.resolveSystemRuntimeMetadata('default');
  }

  /**
   * 新页面：根据服务端已知的所属系统（当前为 'default'）解析唯一的 active profile。
   * status 必须为 active；deprecated 或 disabled 均被拒绝（由 resolveSystem fail-close）。
   */
  resolveSystemRuntimeMetadata(systemId: string = 'default'): PageRuntimeMetadata {
    const profile = this.deploymentRegistry.resolveSystem(systemId);
    return {
      systemId: profile.systemId,
      runtimeCompatibility: toRuntimeCompatibility(profile),
    };
  }

  /**
   * 已有页面保存产生新快照：
   * 根据已绑定页面当前快照的可信三元组精确解析。
   * ADR-0006：active 允许；deprecated 保持已有绑定允许；disabled 禁止保存；unknown/mismatch 拒绝。
   */
  resolveExistingPageRuntimeMetadata(
    systemId: string,
    runtimeCompatibility: RuntimeCompatibility,
  ): PageRuntimeMetadata {
    const profile = this.deploymentRegistry.resolveSnapshot(runtimeCompatibility);
    if (profile.systemId !== systemId) {
      throw new BadRequestException(
        `System mismatch for page: expected systemId ${profile.systemId}, found ${systemId}`,
      );
    }
    return {
      systemId: profile.systemId,
      runtimeCompatibility: toRuntimeCompatibility(profile),
    };
  }
}
