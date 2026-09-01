/**
 * AntD Preset 组装（Issue #19 / M0-4 Scope B）
 *
 * Registry 仅在 Bootstrap 阶段构建：模块加载即通过 createSealedPreset
 * seal，之后整棵结构深冻结，不暴露任何 register() / 可变 Map。
 */

import {
  createSealedPreset,
  RENDERER_VERSION,
  type ComponentPreset,
} from '@lowcode-platform/renderer';
import { antdRuntime } from './runtime';
import { antdManifest } from './manifest';
import { antdValidation } from './validation';
import { antdCompilerBindings } from './compiler';

export const ANT_PRESET_ID = 'builtin-antd';
export const ANT_PRESET_VERSION = '0.1.0';
export const ANTD_RUNTIME_COMPATIBILITY = Object.freeze({
  componentPresetId: ANT_PRESET_ID,
  componentPresetVersion: ANT_PRESET_VERSION,
  rendererVersion: RENDERER_VERSION,
});

/**
 * 每次调用返回一个新的 sealed 实例（注册表内容共享、结构只读），
 * 供测试或需要独立 Preset 实例的宿主使用。
 */
export function createAntdPreset(): ComponentPreset {
  return createSealedPreset({
    id: ANT_PRESET_ID,
    version: ANT_PRESET_VERSION,
    runtime: antdRuntime,
    manifest: antdManifest,
    validation: antdValidation,
    compiler: antdCompilerBindings,
  });
}

/** Bootstrap 阶段 seal 的默认 AntD Preset 单例 */
export const antdPreset: ComponentPreset = createAntdPreset();
