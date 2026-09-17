/**
 * Test Preset 组装（Issue #39 / M1F-2 B4）
 *
 * Registry 仅在 Bootstrap 阶段构建：模块加载即通过 createSealedPreset
 * seal，之后整棵结构深冻结，不暴露任何 register() / 可变 Map。
 */

import {
  createSealedPreset,
  RENDERER_VERSION,
  type ComponentPreset,
} from '@lowcode-platform/renderer';
import { testRuntime } from './runtime';
import { testManifest } from './manifest';
import { testValidation } from './validation';
import { testCompilerBindings } from './compiler';

export const TEST_PRESET_ID = 'builtin-test';
export const TEST_PRESET_VERSION = '0.1.0';
export const TEST_RUNTIME_COMPATIBILITY = Object.freeze({
  componentPresetId: TEST_PRESET_ID,
  componentPresetVersion: TEST_PRESET_VERSION,
  rendererVersion: RENDERER_VERSION,
});

/**
 * 每次调用返回一个新的 sealed 实例（注册表内容共享、结构只读），
 * 供测试或需要独立 Preset 实例的宿主使用。
 */
export function createTestPreset(): ComponentPreset {
  return createSealedPreset({
    id: TEST_PRESET_ID,
    version: TEST_PRESET_VERSION,
    runtime: testRuntime,
    manifest: testManifest,
    validation: testValidation,
    compiler: testCompilerBindings,
  });
}

/** Bootstrap 阶段 seal 的默认 Test Preset 单例 */
export const testPreset: ComponentPreset = createTestPreset();
