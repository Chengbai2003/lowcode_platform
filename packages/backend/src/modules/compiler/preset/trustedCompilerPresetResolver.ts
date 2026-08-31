/**
 * 服务端可信 Compiler Preset 解析器（Issue #19 / PR #35）
 *
 * 架构边界：
 * - 客户端请求中的 presetId / componentSources 不作为可信导入路径来源；
 * - 服务端依据受信任的预设清单（Trusted Compiler Presets）解析组件库代码生成绑定；
 * - 默认预设 'builtin-antd' 映射至 @lowcode-platform/preset-antd/compiler。
 */

import { antdCompilerBindings } from '@lowcode-platform/preset-antd';

export interface CompilerBindings {
  readonly defaultLibrary?: string;
  readonly componentSources?: Readonly<Record<string, string>>;
}

export const TRUSTED_COMPILER_PRESETS: Record<string, CompilerBindings> = Object.freeze({
  'builtin-antd': antdCompilerBindings,
  default: antdCompilerBindings,
});

export function resolveTrustedCompilerBindings(presetId?: string): CompilerBindings {
  if (!presetId || presetId.trim() === '') {
    return TRUSTED_COMPILER_PRESETS.default;
  }

  const normalized = presetId.trim().toLowerCase();
  const matched = TRUSTED_COMPILER_PRESETS[normalized];

  if (!matched) {
    // 未知预设：fail-close 回落至默认安全预设，禁止客户端注入任意模块路径
    return TRUSTED_COMPILER_PRESETS.default;
  }

  return matched;
}
