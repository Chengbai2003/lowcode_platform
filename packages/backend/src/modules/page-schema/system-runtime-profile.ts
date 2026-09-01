import type { RuntimeCompatibility } from '@lowcode-platform/schema-contract';

/** 部署侧 Runtime Profile 的生命周期；不属于 PageSchema Contract。 */
export type SystemRuntimeProfileStatus = 'active' | 'deprecated' | 'disabled';

/**
 * 服务端部署的可信运行时配置。
 *
 * 三个兼容性字段投影为快照中唯一持久化的运行时信息；
 * `compilerBindingId` 仅供服务端部署配置关联受信任绑定，绝不进入 Schema 或客户端请求。
 */
export interface SystemRuntimeProfile {
  readonly systemId: string;
  readonly componentPresetId: string;
  readonly componentPresetVersion: string;
  readonly rendererVersion: string;
  readonly compilerBindingId: string;
  readonly status: SystemRuntimeProfileStatus;
}

/** 将部署 Profile 投影为允许进入快照的精确兼容性三元组。 */
export function toRuntimeCompatibility(profile: SystemRuntimeProfile): RuntimeCompatibility {
  return Object.freeze({
    componentPresetId: profile.componentPresetId,
    componentPresetVersion: profile.componentPresetVersion,
    rendererVersion: profile.rendererVersion,
  });
}
