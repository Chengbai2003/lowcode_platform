import type { RuntimeCompatibility } from '@lowcode-platform/schema-contract';
import { ANTD_RUNTIME_COMPATIBILITY } from '@lowcode-platform/preset-antd';
import { toRuntimeCompatibility, type SystemRuntimeProfile } from './system-runtime-profile';

/**
 * M1F-2 B1 的部署静态内置 Profile。
 *
 * B2 才负责按 systemId 选择当前 Profile、按 RuntimeCompatibility 恢复历史 Profile，
 * 并对 unknown / disabled / version mismatch fail-close。
 */
export const BUILTIN_ANTD_SYSTEM_RUNTIME_PROFILE: SystemRuntimeProfile = Object.freeze({
  systemId: 'default',
  componentPresetId: ANTD_RUNTIME_COMPATIBILITY.componentPresetId,
  componentPresetVersion: ANTD_RUNTIME_COMPATIBILITY.componentPresetVersion,
  rendererVersion: ANTD_RUNTIME_COMPATIBILITY.rendererVersion,
  compilerBindingId: 'builtin-antd-compiler-bindings-0.1.0',
  status: 'active',
});

/** 服务端唯一支持的内置 AntD 快照兼容性三元组。 */
export const BUILTIN_ANTD_RUNTIME_PROFILE: RuntimeCompatibility = toRuntimeCompatibility(
  BUILTIN_ANTD_SYSTEM_RUNTIME_PROFILE,
);
