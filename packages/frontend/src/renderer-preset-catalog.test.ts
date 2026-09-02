import { antdPreset } from '@lowcode-platform/preset-antd';
import {
  createSealedPreset,
  RENDERER_VERSION,
  type ComponentPreset,
} from '@lowcode-platform/renderer';
import { describe, expect, it } from 'vitest';
import {
  BUILTIN_RENDERER_PRESET_CATALOG,
  RendererPresetCatalog,
  type RendererPresetRegistration,
  type RendererPresetStatus,
} from './renderer-preset-catalog';

const compatibility = {
  componentPresetId: antdPreset.id,
  componentPresetVersion: antdPreset.version,
  rendererVersion: RENDERER_VERSION,
};

function createPreset(id: string, version: string): ComponentPreset {
  return createSealedPreset({
    id,
    version,
    runtime: antdPreset.runtime,
    manifest: antdPreset.manifest,
    validation: antdPreset.validation,
    compiler: antdPreset.compiler,
  });
}

function registration(
  preset: ComponentPreset,
  status: RendererPresetStatus = 'active',
  rendererVersion = RENDERER_VERSION,
): RendererPresetRegistration {
  return { preset, rendererVersion, status };
}

describe('RendererPresetCatalog', () => {
  it('initializes the built-in bootstrap catalog from the bundled AntD preset', () => {
    expect(BUILTIN_RENDERER_PRESET_CATALOG.resolve(compatibility)).toBe(antdPreset);
  });

  it('resolves only its bundled preset and freezes bootstrap configuration', () => {
    const catalog = new RendererPresetCatalog([registration(antdPreset)]);

    expect(catalog.resolve(compatibility)).toBe(antdPreset);
    expect(Object.isFrozen(catalog)).toBe(true);
  });

  it('rejects a deeply frozen preset that bypasses createSealedPreset', () => {
    const unsealedPreset = Object.freeze({
      ...antdPreset,
      runtime: Object.freeze({ ...antdPreset.runtime }),
      manifest: Object.freeze({ ...antdPreset.manifest }),
      validation: Object.freeze({ ...antdPreset.validation }),
      compiler: Object.freeze({
        ...antdPreset.compiler,
        componentSources: Object.freeze({ ...antdPreset.compiler.componentSources }),
        componentBindings: Object.freeze({ ...antdPreset.compiler.componentBindings }),
      }),
    }) as ComponentPreset;

    expect(() => new RendererPresetCatalog([registration(unsealedPreset)])).toThrow(
      'preset must be sealed',
    );
  });

  it.each([
    ['unknown preset', { ...compatibility, componentPresetId: 'unknown' }],
    ['preset version mismatch', { ...compatibility, componentPresetVersion: '0.0.0' }],
    ['renderer version mismatch', { ...compatibility, rendererVersion: '0.0.0' }],
  ])('fails closed for %s', (_reason, unsupportedCompatibility) => {
    const catalog = new RendererPresetCatalog([registration(antdPreset)]);
    expect(() => catalog.resolve(unsupportedCompatibility)).toThrow(
      'Unsupported runtimeCompatibility',
    );
  });

  it.each([
    ['empty preset id', { ...antdPreset, id: ' ' } as ComponentPreset],
    ['empty preset version', { ...antdPreset, version: ' ' } as ComponentPreset],
    ['wrong renderer version', antdPreset],
  ])('rejects invalid bootstrap configuration: %s', (reason, preset) => {
    const rendererVersion = reason === 'wrong renderer version' ? '0.0.0' : RENDERER_VERSION;
    expect(
      () => new RendererPresetCatalog([registration(preset, 'active', rendererVersion)]),
    ).toThrow();
  });

  it('rejects duplicate compatibility tuples', () => {
    expect(
      () => new RendererPresetCatalog([registration(antdPreset), registration(antdPreset)]),
    ).toThrow();
  });

  it('keeps compatibility tuples distinct when fields contain a delimiter character', () => {
    const first = createPreset('preset\u0000version', '1');
    const second = createPreset('preset', 'version\u00001');
    const catalog = new RendererPresetCatalog([registration(first), registration(second)]);

    expect(
      catalog.resolve({
        componentPresetId: first.id,
        componentPresetVersion: first.version,
        rendererVersion: RENDERER_VERSION,
      }),
    ).toBe(first);
    expect(
      catalog.resolve({
        componentPresetId: second.id,
        componentPresetVersion: second.version,
        rendererVersion: RENDERER_VERSION,
      }),
    ).toBe(second);
  });

  it('restores a deprecated preset but rejects a disabled preset', () => {
    const deprecated = createPreset('deprecated-preset', '1.0.0');
    const disabled = createPreset('disabled-preset', '1.0.0');
    const catalog = new RendererPresetCatalog([
      registration(deprecated, 'deprecated'),
      registration(disabled, 'disabled'),
    ]);

    expect(
      catalog.resolve({
        componentPresetId: deprecated.id,
        componentPresetVersion: deprecated.version,
        rendererVersion: RENDERER_VERSION,
      }),
    ).toBe(deprecated);
    expect(() =>
      catalog.resolve({
        componentPresetId: disabled.id,
        componentPresetVersion: disabled.version,
        rendererVersion: RENDERER_VERSION,
      }),
    ).toThrow('Disabled runtimeCompatibility');
  });

  it('rejects an invalid bootstrap lifecycle status', () => {
    expect(
      () =>
        new RendererPresetCatalog([
          { ...registration(antdPreset), status: 'unknown' as RendererPresetStatus },
        ]),
    ).toThrow('invalid status');
  });
});
