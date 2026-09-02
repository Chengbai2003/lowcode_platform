import { BadRequestException } from '@nestjs/common';
import { antdCompilerBindings } from '@lowcode-platform/preset-antd';
import type { RuntimeCompatibility } from '@lowcode-platform/schema-contract';
import { BUILTIN_ANTD_SYSTEM_RUNTIME_PROFILE } from '../page-schema/runtime-profiles';
import { SystemRuntimeProfileRegistry } from '../page-schema/system-runtime-profile-registry';
import type { SystemRuntimeProfile } from '../page-schema/system-runtime-profile';

export interface CompilerBindings {
  readonly defaultLibrary?: string;
  readonly componentSources?: Readonly<Record<string, string>>;
  readonly componentBindings?: Readonly<
    Record<string, { readonly module: string; readonly exportName?: string }>
  >;
  readonly allowDefaultComponentFallback?: boolean;
}

function invalid(message: string): never {
  throw new BadRequestException(`Invalid deployment runtime profile registry: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function toFrozenRecord<T>(
  entries: readonly (readonly [string, T])[],
): Readonly<Record<string, T>> {
  const record = Object.create(null) as Record<string, T>;
  for (const [key, value] of entries) {
    record[key] = value;
  }
  return Object.freeze(record);
}

function sealCompilerBindings(bindingId: string, value: unknown): CompilerBindings {
  if (!isRecord(value)) {
    invalid(`compilerBindingId=${bindingId} must reference an object`);
  }

  if (!hasOwn(value, 'defaultLibrary') || !isNonEmptyString(value.defaultLibrary)) {
    invalid(`compilerBindingId=${bindingId} has an invalid defaultLibrary`);
  }
  if (
    !hasOwn(value, 'allowDefaultComponentFallback') ||
    typeof value.allowDefaultComponentFallback !== 'boolean'
  ) {
    invalid(`compilerBindingId=${bindingId} has an invalid allowDefaultComponentFallback`);
  }

  if (!hasOwn(value, 'componentSources') || !isRecord(value.componentSources)) {
    invalid(`compilerBindingId=${bindingId} has invalid componentSources`);
  }
  const componentSourceEntries = Object.entries(value.componentSources).map(
    ([componentType, module]) => {
      if (!isNonEmptyString(componentType) || !isNonEmptyString(module)) {
        invalid(`compilerBindingId=${bindingId} has an invalid component source`);
      }
      return [componentType, module] as const;
    },
  );
  const componentSources = toFrozenRecord(componentSourceEntries);

  let componentBindings: CompilerBindings['componentBindings'];
  if (hasOwn(value, 'componentBindings') && value.componentBindings !== undefined) {
    if (!isRecord(value.componentBindings)) {
      invalid(`compilerBindingId=${bindingId} has invalid componentBindings`);
    }
    const componentBindingEntries = Object.entries(value.componentBindings).map(
      ([componentType, binding]) => {
        if (!isNonEmptyString(componentType) || !isRecord(binding) || !hasOwn(binding, 'module')) {
          invalid(`compilerBindingId=${bindingId} has an invalid component binding`);
        }

        const module = binding.module;
        if (!isNonEmptyString(module)) {
          invalid(`compilerBindingId=${bindingId} has an invalid component binding`);
        }
        const exportName = hasOwn(binding, 'exportName') ? binding.exportName : undefined;
        if (exportName !== undefined && !isNonEmptyString(exportName)) {
          invalid(`compilerBindingId=${bindingId} has an invalid component binding`);
        }

        const sealedBinding = exportName === undefined ? { module } : { module, exportName };
        return [componentType, Object.freeze(sealedBinding)] as const;
      },
    );
    componentBindings = toFrozenRecord(componentBindingEntries);
  }

  return Object.freeze({
    defaultLibrary: value.defaultLibrary,
    componentSources,
    ...(componentBindings === undefined ? {} : { componentBindings }),
    allowDefaultComponentFallback: value.allowDefaultComponentFallback,
  });
}

/** Deployment composition of static Profiles and trusted compiler bindings. */
export class DeploymentRuntimeProfileRegistry {
  private readonly profileRegistry: SystemRuntimeProfileRegistry;
  private readonly compilerBindings: Readonly<Record<string, CompilerBindings>>;

  public constructor(
    profiles: readonly SystemRuntimeProfile[],
    compilerBindings: Readonly<Record<string, CompilerBindings>>,
  ) {
    const bindingIds = Object.keys(compilerBindings);
    if (bindingIds.length === 0) invalid('at least one compiler binding is required');
    if (bindingIds.some((bindingId) => bindingId.trim() === '')) {
      invalid('compiler binding ids must be non-empty');
    }
    const sealedBindings = toFrozenRecord(
      bindingIds.map(
        (bindingId) =>
          [bindingId, sealCompilerBindings(bindingId, compilerBindings[bindingId])] as const,
      ),
    );
    const profileWithUnknownBinding = profiles.find(
      (profile) => !Object.prototype.hasOwnProperty.call(sealedBindings, profile.compilerBindingId),
    );
    if (profileWithUnknownBinding) {
      invalid(
        `systemId=${profileWithUnknownBinding.systemId} references unknown compilerBindingId=${profileWithUnknownBinding.compilerBindingId}`,
      );
    }

    this.profileRegistry = new SystemRuntimeProfileRegistry(profiles);
    this.compilerBindings = sealedBindings;
    Object.freeze(this);
  }

  public resolveSystem(systemId: string): SystemRuntimeProfile {
    return this.profileRegistry.resolveSystem(systemId);
  }

  public resolveSnapshot(runtimeCompatibility: RuntimeCompatibility): SystemRuntimeProfile {
    return this.profileRegistry.resolveSnapshot(runtimeCompatibility);
  }

  public resolveCompilerBindings(runtimeCompatibility: RuntimeCompatibility): CompilerBindings {
    const compilerBindingId = this.resolveSnapshot(runtimeCompatibility).compilerBindingId;
    const compilerBindings = this.compilerBindings[compilerBindingId];
    if (!compilerBindings) {
      invalid(`unknown compilerBindingId=${compilerBindingId}`);
    }
    return compilerBindings;
  }
}

export const DEPLOYMENT_RUNTIME_PROFILE_REGISTRY = new DeploymentRuntimeProfileRegistry(
  [BUILTIN_ANTD_SYSTEM_RUNTIME_PROFILE],
  Object.freeze({
    'builtin-antd-compiler-bindings-0.1.0': antdCompilerBindings,
  }),
);
