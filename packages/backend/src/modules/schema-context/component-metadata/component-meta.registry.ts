import { Injectable, Optional } from '@nestjs/common';
import { BackendComponentMeta } from './component-meta.types';
import { ALIASES, REGISTRY } from './component-manifest';

/**
 * ComponentMetaRegistry — thin facade over shared manifest.
 *
 * Data lives in component-manifest.ts (single source for backend/frontend
 * codegen). This file only provides lookup + alias resolution.
 * Future: generate frontend manifest from same source + CI checksum.
 */

@Injectable()
export class ComponentMetaRegistry {
  private readonly registry: ReadonlyMap<string, BackendComponentMeta>;
  private readonly aliases: ReadonlyMap<string, string>;

  constructor(
    @Optional() registryData?: readonly BackendComponentMeta[],
    @Optional() aliasesData?: ReadonlyMap<string, string>,
  ) {
    this.registry = new Map((registryData ?? REGISTRY).map((meta) => [meta.type, meta]));
    this.aliases = aliasesData ?? ALIASES;
    Object.freeze(this);
  }

  get(type: string): BackendComponentMeta | undefined {
    return this.registry.get(type);
  }

  resolve(type: string): BackendComponentMeta | undefined {
    const resolved = this.aliases.get(type) ?? type;
    return this.registry.get(resolved);
  }

  getAllTypeNames(): string[] {
    return Array.from(this.registry.keys());
  }

  getAll(): BackendComponentMeta[] {
    return Array.from(this.registry.values());
  }

  getDisplayName(type: string): string | undefined {
    return this.resolve(type)?.displayName;
  }

  isContainer(type: string): boolean {
    return this.resolve(type)?.isContainer ?? false;
  }

  getTextProps(type: string): string[] {
    return [...(this.resolve(type)?.textProps ?? [])];
  }
}

export const BUILTIN_ANTD_COMPONENT_META_REGISTRY = new ComponentMetaRegistry();
