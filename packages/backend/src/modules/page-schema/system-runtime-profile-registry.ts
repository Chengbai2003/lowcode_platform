import { BadRequestException } from '@nestjs/common';
import type { RuntimeCompatibility } from '@lowcode-platform/schema-contract';
import type { SystemRuntimeProfile } from './system-runtime-profile';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function tupleOf(profile: RuntimeCompatibility): string {
  return JSON.stringify([
    profile.componentPresetId,
    profile.componentPresetVersion,
    profile.rendererVersion,
  ]);
}

function describeRuntimeCompatibility(runtimeCompatibility: RuntimeCompatibility): string {
  return `componentPresetId=${String(runtimeCompatibility?.componentPresetId)}, componentPresetVersion=${String(runtimeCompatibility?.componentPresetVersion)}, rendererVersion=${String(runtimeCompatibility?.rendererVersion)}`;
}

function invalid(message: string): never {
  throw new BadRequestException(`Invalid SystemRuntimeProfile Registry: ${message}`);
}

/** Immutable deployment-time allowlist for systems and snapshot versions. */
export class SystemRuntimeProfileRegistry {
  private readonly profiles: readonly SystemRuntimeProfile[];

  public constructor(profiles: readonly SystemRuntimeProfile[]) {
    if (profiles.length === 0) invalid('at least one profile is required');

    const activeSystems = new Set<string>();
    const tuples = new Set<string>();

    this.profiles = Object.freeze(
      profiles.map((profile) => {
        if (!isRecord(profile)) {
          invalid('every profile must be an object');
        }
        if (
          !hasOwn(profile, 'systemId') ||
          !hasOwn(profile, 'componentPresetId') ||
          !hasOwn(profile, 'componentPresetVersion') ||
          !hasOwn(profile, 'rendererVersion') ||
          !hasOwn(profile, 'compilerBindingId') ||
          !hasOwn(profile, 'status')
        ) {
          invalid('all profile fields must be own properties');
        }
        if (
          !isNonEmptyString(profile.systemId) ||
          !isNonEmptyString(profile.componentPresetId) ||
          !isNonEmptyString(profile.componentPresetVersion) ||
          !isNonEmptyString(profile.rendererVersion) ||
          !isNonEmptyString(profile.compilerBindingId)
        ) {
          invalid('all profile fields must be non-empty');
        }
        if (
          profile.status !== 'active' &&
          profile.status !== 'deprecated' &&
          profile.status !== 'disabled'
        ) {
          invalid(`unknown status=${String(profile.status)}`);
        }
        if (profile.status === 'active' && activeSystems.has(profile.systemId)) {
          invalid(`duplicate active systemId=${profile.systemId}`);
        }
        if (profile.status === 'active') activeSystems.add(profile.systemId);
        const tuple = tupleOf(profile);
        if (tuples.has(tuple)) invalid(`duplicate compatibility tuple=${tuple}`);
        tuples.add(tuple);
        return Object.freeze({
          systemId: profile.systemId,
          componentPresetId: profile.componentPresetId,
          componentPresetVersion: profile.componentPresetVersion,
          rendererVersion: profile.rendererVersion,
          compilerBindingId: profile.compilerBindingId,
          status: profile.status,
        });
      }),
    );
    Object.freeze(this);
  }

  public resolveSystem(systemId: string): SystemRuntimeProfile {
    const profile = this.profiles.find(
      (candidate) => candidate.systemId === systemId && candidate.status === 'active',
    );
    if (!profile) {
      throw new BadRequestException(`Unsupported active systemId: ${String(systemId)}`);
    }
    return profile;
  }

  public resolveSnapshot(runtimeCompatibility: RuntimeCompatibility): SystemRuntimeProfile {
    const profile = this.profiles.find(
      (candidate) =>
        candidate.status !== 'disabled' &&
        candidate.componentPresetId === runtimeCompatibility?.componentPresetId &&
        candidate.componentPresetVersion === runtimeCompatibility?.componentPresetVersion &&
        candidate.rendererVersion === runtimeCompatibility?.rendererVersion,
    );
    if (!profile) {
      throw new BadRequestException(
        `Unsupported runtimeCompatibility: ${describeRuntimeCompatibility(runtimeCompatibility)}`,
      );
    }
    return profile;
  }
}
