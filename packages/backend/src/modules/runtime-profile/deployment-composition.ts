/**
 * 部署静态组合（Issue #39 / M1F-2 B4）。
 *
 * 静态声明 DeploymentRuntimeProfileRegistry 的全部输入：Profiles、Compiler
 * Bindings 与按 presetId@version 精确注册的组件 Meta。组合只在进程启动时
 * 确定一次（默认 `default`，可用环境变量选择 `b4-acceptance`），不存在
 * 运行中切换全局 current 的入口。
 *
 * - `default`（正常部署）：default 系统 active = builtin-antd；builtin-test
 *   资产已注册但 Profile 为 deprecated（只承接历史快照，不绑定新页面）。
 * - `b4-acceptance`（B4 验收部署）：default 系统 active = builtin-test；
 *   builtin-antd 降级为 deprecated（历史页面可读/可存，新页面绑定 test）。
 *
 * 两个组合共享同一份静态资产，差异仅是 active 指向——A→B 升级即以新组合
 * 重启进程，无需迁移任何数据。
 */

import { antdCompilerBindings } from '@lowcode-platform/preset-antd';
import { testCompilerBindings } from '@lowcode-platform/preset-test';
import {
  BUILTIN_ANTD_SYSTEM_RUNTIME_PROFILE,
  BUILTIN_ANTD_SYSTEM_RUNTIME_PROFILE_DEPRECATED,
  BUILTIN_TEST_SYSTEM_RUNTIME_PROFILE,
  BUILTIN_TEST_SYSTEM_RUNTIME_PROFILE_DEPRECATED,
} from '../page-schema/runtime-profiles';
import type { SystemRuntimeProfile } from '../page-schema/system-runtime-profile';
import {
  BUILTIN_ANTD_COMPONENT_META_REGISTRY,
  ComponentMetaRegistry,
} from '../schema-context/component-metadata/component-meta.registry';
import { BUILTIN_TEST_COMPONENT_META_REGISTRY } from '../schema-context/component-metadata/test-component-manifest';
import type { CompilerBindings } from './deployment-runtime-profile-registry';

export type DeploymentCompositionId = 'default' | 'b4-acceptance';

export const DEPLOYMENT_COMPOSITION_ENV_VAR = 'LOWCODE_DEPLOYMENT_COMPOSITION';

const KNOWN_COMPOSITION_IDS: readonly DeploymentCompositionId[] = ['default', 'b4-acceptance'];

/**
 * 启动时解析部署组合；未知取值 fail-close（直接抛错阻止进程以错误组合启动），
 * 不做任何静默回退。
 */
export function resolveDeploymentCompositionId(
  env: Record<string, string | undefined> = process.env,
): DeploymentCompositionId {
  const raw = env[DEPLOYMENT_COMPOSITION_ENV_VAR];
  if (raw === undefined || raw === '') {
    return 'default';
  }
  const known = KNOWN_COMPOSITION_IDS.find((id) => id === raw);
  if (!known) {
    throw new Error(
      `Unknown deployment composition "${raw}" (${DEPLOYMENT_COMPOSITION_ENV_VAR}); known: ${KNOWN_COMPOSITION_IDS.join(', ')}`,
    );
  }
  return known;
}

const DEPLOYMENT_COMPILER_BINDINGS: Readonly<Record<string, CompilerBindings>> = Object.freeze({
  'builtin-antd-compiler-bindings-0.1.0': antdCompilerBindings,
  'builtin-test-compiler-bindings-0.1.0': testCompilerBindings,
});

const DEPLOYMENT_COMPONENT_METAS: Readonly<Record<string, ComponentMetaRegistry>> = Object.freeze({
  'builtin-antd': BUILTIN_ANTD_COMPONENT_META_REGISTRY,
  'builtin-antd@0.1.0': BUILTIN_ANTD_COMPONENT_META_REGISTRY,
  'builtin-test@0.1.0': BUILTIN_TEST_COMPONENT_META_REGISTRY,
});

export interface DeploymentComposition {
  readonly id: DeploymentCompositionId;
  readonly profiles: readonly SystemRuntimeProfile[];
  readonly compilerBindings: Readonly<Record<string, CompilerBindings>>;
  readonly componentMetas: Readonly<Record<string, ComponentMetaRegistry>>;
}

const DEPLOYMENT_COMPOSITIONS: Readonly<Record<DeploymentCompositionId, DeploymentComposition>> =
  Object.freeze({
    default: Object.freeze({
      id: 'default',
      profiles: Object.freeze([
        BUILTIN_ANTD_SYSTEM_RUNTIME_PROFILE,
        BUILTIN_TEST_SYSTEM_RUNTIME_PROFILE_DEPRECATED,
      ]),
      compilerBindings: DEPLOYMENT_COMPILER_BINDINGS,
      componentMetas: DEPLOYMENT_COMPONENT_METAS,
    }),
    'b4-acceptance': Object.freeze({
      id: 'b4-acceptance',
      profiles: Object.freeze([
        BUILTIN_TEST_SYSTEM_RUNTIME_PROFILE,
        BUILTIN_ANTD_SYSTEM_RUNTIME_PROFILE_DEPRECATED,
      ]),
      compilerBindings: DEPLOYMENT_COMPILER_BINDINGS,
      componentMetas: DEPLOYMENT_COMPONENT_METAS,
    }),
  });

export function getDeploymentComposition(id: DeploymentCompositionId): DeploymentComposition {
  const composition = DEPLOYMENT_COMPOSITIONS[id];
  if (!composition) {
    throw new Error(`Unknown deployment composition "${id}"`);
  }
  return composition;
}
