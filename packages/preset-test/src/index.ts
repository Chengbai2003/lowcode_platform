/**
 * @lowcode-platform/preset-test
 *
 * 第二个可信 ComponentPreset（Issue #39 / M1F-2 B4 验收参考包）：
 * 仅 React + 基础 DOM 的最小实现，用于证明可信 Preset 扩展闭环，
 * 不是通用生产 UI 库。
 *
 * 子路径导出：
 * - /runtime    组件运行时注册表
 * - /manifest   组件 Manifest（Props 白名单）
 * - /validation 组件级 Validation 钩子
 * - /compiler   Compiler 绑定（组件 import 来源）
 */

export { testRuntime } from './runtime';
export { testManifest, TEST_MANIFEST_VERSION } from './manifest';
export { testValidation } from './validation';
export { testCompilerBindings } from './compiler';
export {
  createTestPreset,
  testPreset,
  TEST_PRESET_ID,
  TEST_PRESET_VERSION,
  TEST_RUNTIME_COMPATIBILITY,
} from './createTestPreset';
