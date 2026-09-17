import {
  DEPLOYMENT_COMPOSITION_ENV_VAR,
  getDeploymentComposition,
  resolveDeploymentCompositionId,
} from '../deployment-composition';
import { DeploymentRuntimeProfileRegistry } from '../deployment-runtime-profile-registry';
import {
  BUILTIN_ANTD_RUNTIME_PROFILE,
  BUILTIN_TEST_RUNTIME_PROFILE,
} from '../../page-schema/runtime-profiles';
import {
  TEST_PRESET_ID,
  TEST_PRESET_VERSION,
  TEST_RUNTIME_COMPATIBILITY,
  testRuntime,
  testManifest,
} from '@lowcode-platform/preset-test';
import { ANTD_RUNTIME_COMPATIBILITY } from '@lowcode-platform/preset-antd';
import { BUILTIN_TEST_COMPONENT_META_REGISTRY } from '../../schema-context/component-metadata/test-component-manifest';

describe('Deployment composition（Issue #39 / M1F-2 B4）', () => {
  describe('启动时组合选择：fail-close，无静默回退', () => {
    it('未设置或空值时默认 default 组合', () => {
      expect(resolveDeploymentCompositionId({})).toBe('default');
      expect(resolveDeploymentCompositionId({ [DEPLOYMENT_COMPOSITION_ENV_VAR]: '' })).toBe(
        'default',
      );
    });

    it('仅接受已知组合 id，未知取值直接抛错', () => {
      expect(
        resolveDeploymentCompositionId({ [DEPLOYMENT_COMPOSITION_ENV_VAR]: 'b4-acceptance' }),
      ).toBe('b4-acceptance');
      expect(() =>
        resolveDeploymentCompositionId({ [DEPLOYMENT_COMPOSITION_ENV_VAR]: 'production-x' }),
      ).toThrow(/Unknown deployment composition "production-x"/);
    });
  });

  describe('两个组合的 Profile 状态与资产一致性', () => {
    const defaultComposition = getDeploymentComposition('default');
    const acceptanceComposition = getDeploymentComposition('b4-acceptance');

    it('正常部署：antd active，test deprecated（资产已注册但不承接新页面）', () => {
      const actives = defaultComposition.profiles.filter((p) => p.status === 'active');
      expect(actives).toHaveLength(1);
      expect(actives[0]!.systemId).toBe('default');
      expect(actives[0]!.componentPresetId).toBe('builtin-antd');
      const testProfile = defaultComposition.profiles.find(
        (p) => p.componentPresetId === TEST_PRESET_ID,
      );
      expect(testProfile?.status).toBe('deprecated');
    });

    it('B4 验收部署：test active，antd deprecated', () => {
      const actives = acceptanceComposition.profiles.filter((p) => p.status === 'active');
      expect(actives).toHaveLength(1);
      expect(actives[0]!.systemId).toBe('default');
      expect(actives[0]!.componentPresetId).toBe(TEST_PRESET_ID);
      const antdProfile = acceptanceComposition.profiles.find(
        (p) => p.componentPresetId === 'builtin-antd',
      );
      expect(antdProfile?.status).toBe('deprecated');
    });

    it('两个组合共享同一份静态资产（Compiler Bindings / Meta）', () => {
      expect(acceptanceComposition.compilerBindings).toBe(defaultComposition.compilerBindings);
      expect(acceptanceComposition.componentMetas).toBe(defaultComposition.componentMetas);
      expect(Object.keys(acceptanceComposition.compilerBindings).sort()).toEqual([
        'builtin-antd-compiler-bindings-0.1.0',
        'builtin-test-compiler-bindings-0.1.0',
      ]);
      expect(acceptanceComposition.componentMetas['builtin-test@0.1.0']).toBeDefined();
    });

    it('Profile 三元组与真实包常量精确对齐（防漂移）', () => {
      expect(BUILTIN_TEST_RUNTIME_PROFILE).toEqual(TEST_RUNTIME_COMPATIBILITY);
      expect(BUILTIN_ANTD_RUNTIME_PROFILE).toEqual(ANTD_RUNTIME_COMPATIBILITY);
      for (const composition of [defaultComposition, acceptanceComposition]) {
        const testProfile = composition.profiles.find(
          (p) => p.componentPresetId === TEST_PRESET_ID,
        );
        expect(testProfile!.componentPresetVersion).toBe(TEST_PRESET_VERSION);
        expect(testProfile!.rendererVersion).toBe(TEST_RUNTIME_COMPATIBILITY.rendererVersion);
        expect(testProfile!.compilerBindingId).toBe('builtin-test-compiler-bindings-0.1.0');
      }
    });

    it('test Preset 的部署侧 Meta 与包内 Runtime 组件键完全一致（防漂移）', () => {
      const metaTypes = BUILTIN_TEST_COMPONENT_META_REGISTRY.getAllTypeNames().sort();
      expect(metaTypes).toEqual(Object.keys(testRuntime).sort());
      // 别名与 AntD Meta 不共享
      expect(BUILTIN_TEST_COMPONENT_META_REGISTRY.resolve('Action')?.type).toBe('Button');
      expect(BUILTIN_TEST_COMPONENT_META_REGISTRY.resolve('Btn')).toBeUndefined();
    });

    it('Meta allowedProps 白名单与包内 Manifest allowedProps 完全一致（防漂移）', () => {
      for (const type of BUILTIN_TEST_COMPONENT_META_REGISTRY.getAllTypeNames()) {
        const meta = BUILTIN_TEST_COMPONENT_META_REGISTRY.get(type)!;
        expect(`${type}: ${[...(meta.allowedProps ?? [])].sort().join(',')}`).toBe(
          `${type}: ${[...testManifest[type].allowedProps].sort().join(',')}`,
        );
      }
      // AntD 内置 Meta 未声明白名单（opt-in 边界对既有 Preset 零行为变化）
      const antdButtonMeta =
        acceptanceComposition.componentMetas['builtin-antd@0.1.0'].get('Button');
      expect(antdButtonMeta?.allowedProps).toBeUndefined();
    });
  });

  describe('进程级单例按启动组合构建', () => {
    it('测试进程未设置组合变量：单例为 default（antd active）', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const registryModule = require('../deployment-runtime-profile-registry');
      const singleton: DeploymentRuntimeProfileRegistry =
        registryModule.DEPLOYMENT_RUNTIME_PROFILE_REGISTRY;
      expect(singleton.resolveSystem('default').componentPresetId).toBe('builtin-antd');
      // test 资产在正常部署同样可精确解析（承接历史快照）
      expect(singleton.resolveSnapshot(TEST_RUNTIME_COMPATIBILITY).status).toBe('deprecated');
    });

    it('用 b4-acceptance 组合构建的 Registry：active=test，antd 快照仍可解析', () => {
      const composition = getDeploymentComposition('b4-acceptance');
      const registry = new DeploymentRuntimeProfileRegistry(
        composition.profiles,
        composition.compilerBindings,
        composition.componentMetas,
      );
      expect(registry.resolveSystem('default').componentPresetId).toBe(TEST_PRESET_ID);
      expect(registry.resolveSnapshot(ANTD_RUNTIME_COMPATIBILITY).status).toBe('deprecated');
      expect(registry.resolveComponentMeta(TEST_RUNTIME_COMPATIBILITY)).toBeDefined();
      expect(registry.resolveComponentMeta(ANTD_RUNTIME_COMPATIBILITY)).toBeDefined();
    });
  });
});
