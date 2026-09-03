/**
 * @lowcode-platform/preset-antd
 *
 * AntD 单一 ComponentPreset（Issue #19 / M0-4 Scope B）。
 *
 * 子路径导出：
 * - /runtime    组件运行时注册表
 * - /manifest   组件 Manifest（Props 白名单）
 * - /validation 组件级 Validation 钩子
 * - /compiler   Compiler 绑定（组件 import 来源）
 */

export { antdRuntime } from './runtime';
export { antdManifest, ANTD_MANIFEST_VERSION } from './manifest';
export { antdValidation, isUnsafeResourceUrl } from './validation';
export { antdCompilerBindings } from './compiler';
export {
  createAntdPreset,
  antdPreset,
  ANT_PRESET_ID,
  ANT_PRESET_VERSION,
  ANTD_RUNTIME_COMPATIBILITY,
} from './createAntdPreset';
