import { BadRequestException } from '@nestjs/common';
import type { SystemRuntimeProfile } from './system-runtime-profile';
import { SystemRuntimeProfileRegistry } from './system-runtime-profile-registry';

const active: SystemRuntimeProfile = {
  systemId: 'default',
  componentPresetId: 'builtin-antd',
  componentPresetVersion: '0.1.0',
  rendererVersion: '1.0.0',
  compilerBindingId: 'antd-0.1.0',
  status: 'active',
};

describe('SystemRuntimeProfileRegistry', () => {
  it('resolves the unique active system profile and exact active or deprecated snapshots', () => {
    const deprecated = {
      ...active,
      status: 'deprecated' as const,
      componentPresetVersion: '0.0.9',
    };
    const registry = new SystemRuntimeProfileRegistry([active, deprecated]);

    expect(registry.resolveSystem('default')).toEqual(active);
    expect(
      registry.resolveSnapshot({
        componentPresetId: 'builtin-antd',
        componentPresetVersion: '0.0.9',
        rendererVersion: '1.0.0',
      }),
    ).toEqual(deprecated);
    expect(Object.isFrozen(registry)).toBe(true);
  });

  it('keeps compatibility tuples distinct when fields contain a delimiter character', () => {
    const first = {
      ...active,
      componentPresetId: 'preset\u0000version',
      componentPresetVersion: '1',
    };
    const second = {
      ...active,
      systemId: 'secondary',
      componentPresetId: 'preset',
      componentPresetVersion: 'version\u00001',
    };
    const registry = new SystemRuntimeProfileRegistry([first, second]);

    expect(
      registry.resolveSnapshot({
        componentPresetId: first.componentPresetId,
        componentPresetVersion: first.componentPresetVersion,
        rendererVersion: first.rendererVersion,
      }),
    ).toEqual(first);
    expect(
      registry.resolveSnapshot({
        componentPresetId: second.componentPresetId,
        componentPresetVersion: second.componentPresetVersion,
        rendererVersion: second.rendererVersion,
      }),
    ).toEqual(second);
  });

  it.each([
    ['unknown system', () => new SystemRuntimeProfileRegistry([active]).resolveSystem('unknown')],
    [
      'disabled snapshot',
      () =>
        new SystemRuntimeProfileRegistry([{ ...active, status: 'disabled' }]).resolveSnapshot({
          componentPresetId: 'builtin-antd',
          componentPresetVersion: '0.1.0',
          rendererVersion: '1.0.0',
        }),
    ],
    [
      'version mismatch',
      () =>
        new SystemRuntimeProfileRegistry([active]).resolveSnapshot({
          componentPresetId: 'builtin-antd',
          componentPresetVersion: '0.0.0',
          rendererVersion: '1.0.0',
        }),
    ],
  ])('fails closed for %s', (_reason, resolve) => {
    expect(resolve).toThrow(BadRequestException);
  });

  it.each([
    ['empty deployment registry', []],
    ['empty required field', [{ ...active, systemId: ' ' }]],
    ['inherited required fields', [Object.create(active)]],
    ['duplicate active system', [active, { ...active }]],
    [
      'duplicate compatibility tuple',
      [active, { ...active, systemId: 'legacy', status: 'deprecated' as const }],
    ],
  ])('rejects invalid profile configuration: %s', (_reason, profiles) => {
    expect(() => new SystemRuntimeProfileRegistry(profiles)).toThrow();
  });
});
