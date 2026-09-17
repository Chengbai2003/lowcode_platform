/**
 * @lowcode-platform/preset-test/validation
 *
 * 第二个可信 Preset 的组件级 Validation 钩子（Issue #39 / M1F-2 B4）。
 *
 * 该 Preset 的最小组件集合没有可指向任意协议的资源类 Props
 * （无 href / src 等入口），因此不注册任何钩子；Manifest 白名单
 * 仍由 Renderer 的 sanitizePropsByManifest fail-close 执行，
 * dangerous HTML 与函数型 Props 在那一层被统一移除。
 */

import type { ComponentValidationRegistry } from '@lowcode-platform/renderer';

export const testValidation: ComponentValidationRegistry = Object.freeze({});
