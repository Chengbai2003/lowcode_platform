import { antdCompilerBindings } from '@lowcode-platform/preset-antd';
import type { SystemRuntimeProfile } from '../page-schema/system-runtime-profile';
import {
  DeploymentRuntimeProfileRegistry,
  type CompilerBindings,
} from './deployment-runtime-profile-registry';

const activeProfile: SystemRuntimeProfile = {
  systemId: 'default',
  componentPresetId: 'builtin-antd',
  componentPresetVersion: '0.1.0',
  rendererVersion: '1.0.0',
  compilerBindingId: 'builtin-antd-compiler-bindings-0.1.0',
  status: 'active',
};

const compatibility = {
  componentPresetId: 'builtin-antd',
  componentPresetVersion: '0.1.0',
  rendererVersion: '1.0.0',
};

describe('DeploymentRuntimeProfileRegistry', () => {
  it('resolves a trusted compiler binding through the exact snapshot profile', () => {
    const registry = new DeploymentRuntimeProfileRegistry([activeProfile], {
      [activeProfile.compilerBindingId]: antdCompilerBindings,
    });

    expect(registry.resolveSystem('default')).toEqual(activeProfile);
    expect(registry.resolveSnapshot(compatibility)).toEqual(activeProfile);
    expect(registry.resolveCompilerBindings(compatibility)).toEqual(antdCompilerBindings);
    expect(Object.isFrozen(registry)).toBe(true);
  });

  it('copies and freezes bindings with their nested import mappings at bootstrap', () => {
    const componentSources = { Button: '@trusted/runtime' };
    const componentBindings = { Button: { module: '@trusted/runtime', exportName: 'Button' } };
    const bindings = {
      defaultLibrary: 'trusted',
      componentSources,
      componentBindings,
      allowDefaultComponentFallback: false,
    };
    const registry = new DeploymentRuntimeProfileRegistry([activeProfile], {
      [activeProfile.compilerBindingId]: bindings,
    });

    const resolved = registry.resolveCompilerBindings(compatibility);
    componentSources.Button = '@untrusted/runtime';
    componentBindings.Button.module = '@untrusted/runtime';

    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved.componentSources)).toBe(true);
    expect(Object.getPrototypeOf(resolved.componentSources)).toBeNull();
    expect(Object.isFrozen(resolved.componentBindings)).toBe(true);
    expect(Object.isFrozen(resolved.componentBindings?.Button)).toBe(true);
    expect(Reflect.set(resolved.componentSources!, 'Button', '@untrusted/runtime')).toBe(false);
    expect(Reflect.set(resolved.componentBindings!.Button, 'module', '@untrusted/runtime')).toBe(
      false,
    );
    expect(resolved.componentSources?.Button).toBe('@trusted/runtime');
    expect(resolved.componentBindings?.Button?.module).toBe('@trusted/runtime');
  });

  it('ignores inherited component mappings and isolates resolved bindings from prototype changes', () => {
    const componentSources = Object.assign(Object.create({ CustomWidget: '@untrusted/runtime' }), {
      Button: '@trusted/runtime',
    }) as Record<string, string>;
    const componentBindings = Object.assign(
      Object.create({ CustomWidget: { module: '@untrusted/runtime' } }),
      {
        Button: Object.assign(Object.create({ exportName: 'UntrustedButton' }), {
          module: '@trusted/runtime',
        }),
      },
    ) as Record<string, { module: string }>;
    const registry = new DeploymentRuntimeProfileRegistry([activeProfile], {
      [activeProfile.compilerBindingId]: {
        defaultLibrary: 'trusted',
        componentSources,
        componentBindings,
        allowDefaultComponentFallback: false,
      },
    });
    const resolved = registry.resolveCompilerBindings(compatibility);
    Object.setPrototypeOf(componentSources, { Button: '@untrusted/runtime' });
    Object.setPrototypeOf(componentBindings, { Button: { module: '@untrusted/runtime' } });

    expect(resolved.componentSources?.CustomWidget).toBeUndefined();
    expect(resolved.componentBindings?.CustomWidget).toBeUndefined();
    expect(resolved.componentSources?.Button).toBe('@trusted/runtime');
    expect(resolved.componentBindings?.Button?.module).toBe('@trusted/runtime');
    expect(resolved.componentBindings?.Button?.exportName).toBeUndefined();
  });

  it.each([
    ['an empty binding table', {}],
    ['an unknown compiler binding', { other: antdCompilerBindings }],
    ['an inherited object property', {}],
    ['an undefined compiler binding', { 'builtin-antd-compiler-bindings-0.1.0': undefined }],
    [
      'a compiler binding with implicit compiler defaults',
      { 'builtin-antd-compiler-bindings-0.1.0': {} },
    ],
  ])('rejects deployment configuration with %s', (reason, bindings) => {
    const profile =
      reason === 'an inherited object property'
        ? { ...activeProfile, compilerBindingId: 'toString' }
        : activeProfile;
    expect(
      () =>
        new DeploymentRuntimeProfileRegistry(
          [profile],
          bindings as unknown as Readonly<Record<string, CompilerBindings>>,
        ),
    ).toThrow();
  });
});
