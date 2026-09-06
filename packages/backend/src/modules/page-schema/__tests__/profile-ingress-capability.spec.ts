import { BadRequestException } from '@nestjs/common';
import type { SystemRuntimeProfile } from '../system-runtime-profile';
import { SystemRuntimeProfileRegistry } from '../system-runtime-profile-registry';

const currentActiveProfile: SystemRuntimeProfile = {
  systemId: 'default',
  componentPresetId: 'builtin-antd',
  componentPresetVersion: '0.1.0',
  rendererVersion: '1.0.0',
  compilerBindingId: 'antd-0.1.0',
  status: 'active',
};

const historicalDeprecatedProfile: SystemRuntimeProfile = {
  systemId: 'default',
  componentPresetId: 'builtin-antd',
  componentPresetVersion: '0.0.9',
  rendererVersion: '0.9.0',
  compilerBindingId: 'antd-0.0.9-legacy',
  status: 'deprecated',
};

const disabledProfile: SystemRuntimeProfile = {
  systemId: 'legacy-system',
  componentPresetId: 'builtin-antd-legacy',
  componentPresetVersion: '0.0.1',
  rendererVersion: '0.1.0',
  compilerBindingId: 'antd-disabled',
  status: 'disabled',
};

describe('SystemRuntimeProfile Ingress Capability Gates (C3b / Issue #47)', () => {
  let registry: SystemRuntimeProfileRegistry;

  beforeEach(() => {
    registry = new SystemRuntimeProfileRegistry([
      currentActiveProfile,
      historicalDeprecatedProfile,
      disabledProfile,
    ]);
  });

  describe('10. 现有 Profile 组合链路', () => {
    it('rejects unknown systemId without falling back to current active profile', () => {
      let error: unknown;
      try {
        registry.resolveSystem('unknown-system-id');
      } catch (err) {
        error = err;
      }

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toContain(
        'Unsupported active systemId: unknown-system-id',
      );
      // 关键防线断言：绝不静默回退到当前活动 profile
      expect(error).not.toEqual(currentActiveProfile);
    });

    it('rejects disabled profile snapshot without falling back to current active profile', () => {
      let error: unknown;
      try {
        registry.resolveSnapshot({
          componentPresetId: disabledProfile.componentPresetId,
          componentPresetVersion: disabledProfile.componentPresetVersion,
          rendererVersion: disabledProfile.rendererVersion,
        });
      } catch (err) {
        error = err;
      }

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toContain('Unsupported runtimeCompatibility');
      expect((error as BadRequestException).message).toContain(disabledProfile.componentPresetId);
    });

    it('rejects triplet mismatch without falling back to current active profile', () => {
      // 构造三元组 mismatch：componentPresetVersion 不匹配
      const mismatchedTuple = {
        componentPresetId: 'builtin-antd',
        componentPresetVersion: '9.9.9-nonexistent',
        rendererVersion: '1.0.0',
      };

      let error: unknown;
      try {
        registry.resolveSnapshot(mismatchedTuple);
      } catch (err) {
        error = err;
      }

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toContain('Unsupported runtimeCompatibility');
      expect((error as BadRequestException).message).toContain('9.9.9-nonexistent');
    });

    it('resolves valid historical snapshot using its own compatibility info without overriding to current', () => {
      const resolved = registry.resolveSnapshot({
        componentPresetId: historicalDeprecatedProfile.componentPresetId,
        componentPresetVersion: historicalDeprecatedProfile.componentPresetVersion,
        rendererVersion: historicalDeprecatedProfile.rendererVersion,
      });

      expect(resolved).toBeDefined();
      expect(resolved.status).toBe('deprecated');
      expect(resolved.componentPresetVersion).toBe('0.0.9');
      expect(resolved.rendererVersion).toBe('0.9.0');
      // 保持历史快照自身的编译绑定，绝不篡改为当前活动的 antd-0.1.0
      expect(resolved.compilerBindingId).toBe('antd-0.0.9-legacy');
      expect(resolved.compilerBindingId).not.toBe(currentActiveProfile.compilerBindingId);
    });
  });
});
