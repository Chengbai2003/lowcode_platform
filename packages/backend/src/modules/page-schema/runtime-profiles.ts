import type { RuntimeCompatibility } from '@lowcode-platform/schema-contract';
import { ANTD_RUNTIME_COMPATIBILITY } from '@lowcode-platform/preset-antd';
import { TEST_RUNTIME_COMPATIBILITY } from '@lowcode-platform/preset-test';
import { toRuntimeCompatibility, type SystemRuntimeProfile } from './system-runtime-profile';

/**
 * M1F-2 B1 的部署静态内置 Profile。
 *
 * B2 才负责按 systemId 选择当前 Profile、按 RuntimeCompatibility 恢复历史 Profile，
 * 并对 unknown / disabled / version mismatch fail-close。
 */
export const BUILTIN_ANTD_COMPILER_BINDING_ID = 'builtin-antd-compiler-bindings-0.1.0';
export const BUILTIN_TEST_COMPILER_BINDING_ID = 'builtin-test-compiler-bindings-0.1.0';

export const BUILTIN_ANTD_SYSTEM_RUNTIME_PROFILE: SystemRuntimeProfile = Object.freeze({
  systemId: 'default',
  componentPresetId: ANTD_RUNTIME_COMPATIBILITY.componentPresetId,
  componentPresetVersion: ANTD_RUNTIME_COMPATIBILITY.componentPresetVersion,
  rendererVersion: ANTD_RUNTIME_COMPATIBILITY.rendererVersion,
  compilerBindingId: BUILTIN_ANTD_COMPILER_BINDING_ID,
  status: 'active',
});

/** 服务端唯一支持的内置 AntD 快照兼容性三元组。 */
export const BUILTIN_ANTD_RUNTIME_PROFILE: RuntimeCompatibility = toRuntimeCompatibility(
  BUILTIN_ANTD_SYSTEM_RUNTIME_PROFILE,
);

/**
 * M1F-2 B4 的第二个可信 Preset（@lowcode-platform/preset-test）的内置 Profile。
 *
 * 正常部署中该 Preset 的资产（Compiler Binding / Meta）已静态注册，但 Profile
 * 处于 deprecated：只承接历史快照，不绑定新页面；B4 验收组合中它与 AntD 的
 * active 状态互换（见 runtime-profile/deployment-composition.ts）。
 */
export const BUILTIN_TEST_SYSTEM_RUNTIME_PROFILE: SystemRuntimeProfile = Object.freeze({
  systemId: 'default',
  componentPresetId: TEST_RUNTIME_COMPATIBILITY.componentPresetId,
  componentPresetVersion: TEST_RUNTIME_COMPATIBILITY.componentPresetVersion,
  rendererVersion: TEST_RUNTIME_COMPATIBILITY.rendererVersion,
  compilerBindingId: BUILTIN_TEST_COMPILER_BINDING_ID,
  status: 'active',
});

/** 服务端内置 Test Preset 快照兼容性三元组。 */
export const BUILTIN_TEST_RUNTIME_PROFILE: RuntimeCompatibility = toRuntimeCompatibility(
  BUILTIN_TEST_SYSTEM_RUNTIME_PROFILE,
);

/** B4 验收组合（test active）下 AntD 的历史 Profile。 */
export const BUILTIN_ANTD_SYSTEM_RUNTIME_PROFILE_DEPRECATED: SystemRuntimeProfile = Object.freeze({
  systemId: 'default',
  componentPresetId: ANTD_RUNTIME_COMPATIBILITY.componentPresetId,
  componentPresetVersion: ANTD_RUNTIME_COMPATIBILITY.componentPresetVersion,
  rendererVersion: ANTD_RUNTIME_COMPATIBILITY.rendererVersion,
  compilerBindingId: BUILTIN_ANTD_COMPILER_BINDING_ID,
  status: 'deprecated',
});

/** 正常部署（antd active）下 Test Preset 的历史 Profile。 */
export const BUILTIN_TEST_SYSTEM_RUNTIME_PROFILE_DEPRECATED: SystemRuntimeProfile = Object.freeze({
  systemId: 'default',
  componentPresetId: TEST_RUNTIME_COMPATIBILITY.componentPresetId,
  componentPresetVersion: TEST_RUNTIME_COMPATIBILITY.componentPresetVersion,
  rendererVersion: TEST_RUNTIME_COMPATIBILITY.rendererVersion,
  compilerBindingId: BUILTIN_TEST_COMPILER_BINDING_ID,
  status: 'deprecated',
});
