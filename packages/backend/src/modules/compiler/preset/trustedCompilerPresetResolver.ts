/**
 * 服务端可信 Compiler Preset 解析器（Issue #19 / PR #35）
 *
 * 架构边界：
 * - 客户端请求中的 presetId / componentSources 不作为可信导入路径来源；
 * - 服务端依据受信任的预设清单（Trusted Compiler Presets）解析组件库代码生成绑定；
 * - 默认预设 'builtin-antd' 映射至 @lowcode-platform/preset-antd/compiler。
 */

import { BadRequestException } from '@nestjs/common';
import type { RuntimeCompatibility } from '@lowcode-platform/schema-contract';
import {
  DEPLOYMENT_RUNTIME_PROFILE_REGISTRY,
  type CompilerBindings,
} from '../../runtime-profile/deployment-runtime-profile-registry';

export type { CompilerBindings } from '../../runtime-profile/deployment-runtime-profile-registry';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function describeRuntimeCompatibility(runtimeCompatibility: RuntimeCompatibility): string {
  return `componentPresetId=${String(runtimeCompatibility.componentPresetId)}, componentPresetVersion=${String(runtimeCompatibility.componentPresetVersion)}, rendererVersion=${String(runtimeCompatibility.rendererVersion)}`;
}

export function resolveTrustedCompilerBindings(
  runtimeCompatibility: RuntimeCompatibility,
): CompilerBindings {
  if (
    !runtimeCompatibility ||
    !isNonEmptyString(runtimeCompatibility.componentPresetId) ||
    !isNonEmptyString(runtimeCompatibility.componentPresetVersion) ||
    !isNonEmptyString(runtimeCompatibility.rendererVersion)
  ) {
    throw new BadRequestException(
      'Page runtimeCompatibility must include preset and renderer versions',
    );
  }

  try {
    return DEPLOYMENT_RUNTIME_PROFILE_REGISTRY.resolveCompilerBindings(runtimeCompatibility);
  } catch (error) {
    if (!(error instanceof BadRequestException)) {
      throw error;
    }
    throw new BadRequestException(
      `Unsupported compiler runtimeCompatibility: ${describeRuntimeCompatibility(runtimeCompatibility)}`,
    );
  }
}
