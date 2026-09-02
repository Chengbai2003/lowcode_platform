import { antdPreset } from '@lowcode-platform/preset-antd';
import {
  isSealedComponentPreset,
  RENDERER_VERSION,
  type ComponentPreset,
} from '@lowcode-platform/renderer';
import type { RuntimeCompatibility } from '@lowcode-platform/schema-contract';

export type RendererPresetStatus = 'active' | 'deprecated' | 'disabled';

export interface RendererPresetRegistration {
  readonly preset: ComponentPreset;
  readonly rendererVersion: string;
  readonly status: RendererPresetStatus;
}

interface RendererPresetCatalogEntry {
  readonly preset: ComponentPreset;
  readonly status: RendererPresetStatus;
}

function compatibilityKey(runtimeCompatibility: RuntimeCompatibility): string {
  return JSON.stringify([
    runtimeCompatibility.componentPresetId,
    runtimeCompatibility.componentPresetVersion,
    runtimeCompatibility.rendererVersion,
  ]);
}

function toRuntimeCompatibility(registration: RendererPresetRegistration): RuntimeCompatibility {
  return Object.freeze({
    componentPresetId: registration.preset.id,
    componentPresetVersion: registration.preset.version,
    rendererVersion: registration.rendererVersion,
  });
}

function isRendererPresetStatus(value: unknown): value is RendererPresetStatus {
  return value === 'active' || value === 'deprecated' || value === 'disabled';
}

/** Frontend bootstrap allowlist for ComponentPreset modules already bundled with the host. */
export class RendererPresetCatalog {
  private readonly presetsByCompatibility: Readonly<Record<string, RendererPresetCatalogEntry>>;

  public constructor(registrations: readonly RendererPresetRegistration[]) {
    if (registrations.length === 0) {
      throw new Error('RendererPresetCatalog requires at least one bundled preset');
    }

    const presetsByCompatibility: Record<string, RendererPresetCatalogEntry> = Object.create(null);
    for (const registration of registrations) {
      if (!registration || typeof registration !== 'object') {
        throw new Error('RendererPresetCatalog registration must be an object');
      }
      const { preset, rendererVersion, status } = registration;
      if (!isSealedComponentPreset(preset)) {
        throw new Error('RendererPresetCatalog preset must be sealed at bootstrap');
      }
      if (!preset.id.trim() || !preset.version.trim()) {
        throw new Error('RendererPresetCatalog preset id and version must be non-empty');
      }
      if (rendererVersion !== RENDERER_VERSION) {
        throw new Error(
          `RendererPresetCatalog rendererVersion=${rendererVersion} does not match bundled rendererVersion=${RENDERER_VERSION}`,
        );
      }
      if (!isRendererPresetStatus(status)) {
        throw new Error(`RendererPresetCatalog has invalid status=${JSON.stringify(status)}`);
      }

      const key = compatibilityKey(toRuntimeCompatibility(registration));
      if (Object.prototype.hasOwnProperty.call(presetsByCompatibility, key)) {
        throw new Error(`RendererPresetCatalog duplicate runtimeCompatibility: ${key}`);
      }
      presetsByCompatibility[key] = Object.freeze({ preset, status });
    }

    this.presetsByCompatibility = Object.freeze(presetsByCompatibility);
    Object.freeze(this);
  }

  public resolve(runtimeCompatibility: RuntimeCompatibility): ComponentPreset {
    const key = compatibilityKey(runtimeCompatibility);
    const entry = this.presetsByCompatibility[key];
    if (!entry) {
      throw new Error(
        `Unsupported runtimeCompatibility: ${JSON.stringify(runtimeCompatibility ?? null)}`,
      );
    }
    if (entry.status === 'disabled') {
      throw new Error(
        `Disabled runtimeCompatibility: ${JSON.stringify(runtimeCompatibility ?? null)}`,
      );
    }
    return entry.preset;
  }
}

/** Process-lifetime catalog assembled from modules bundled at frontend bootstrap. */
export const BUILTIN_RENDERER_PRESET_CATALOG = new RendererPresetCatalog([
  { preset: antdPreset, rendererVersion: RENDERER_VERSION, status: 'active' },
]);
