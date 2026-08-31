import React from 'react';
import type {
  ComponentPreset,
  ComponentManifestEntry,
  ComponentPropsValidator,
  CompilerBindings,
  CompilerComponentBinding,
} from './types';
import { createSealedPreset } from './createSealedPreset';

/**
 * 单个组件扩展定义（Issue #19 / M0-4 Scope B）
 */
export interface ComponentPresetExtension {
  readonly type: string;
  readonly component: React.ComponentType<any>;
  readonly manifest: ComponentManifestEntry;
  readonly validator?: ComponentPropsValidator;
  readonly compilerBinding: CompilerComponentBinding;
}

/** Host extension payload keyed by component type. */
export interface ComponentExtension {
  readonly component: React.ComponentType<any>;
  readonly manifest: ComponentManifestEntry;
  readonly validator?: ComponentPropsValidator;
  readonly compilerBinding: CompilerComponentBinding;
}

/**
 * Preset 组合配置选项
 */
export interface PresetCompositionOptions {
  readonly id?: string;
  readonly version?: string;
  readonly base: ComponentPreset;
  readonly extensions?: readonly ComponentPresetExtension[];
}

/**
 * 组合并封闭构建一个新的 ComponentPreset
 *
 * 核心设计约束：
 * 1. 每个扩展组件必须显式提供合法的 ComponentManifestEntry；
 * 2. 严格检测组件名冲突，禁止静默覆盖 base 核心组件；
 * 3. 拒绝任何无 Manifest 的裸组件；
 * 4. 同步生成与合并 Runtime 和 Compiler 绑定；
 * 5. 返回深冻结且不可变（sealed）的 ComponentPreset。
 */
export function createComponentPreset(options: PresetCompositionOptions): ComponentPreset {
  const { base, extensions = [] } = options;
  if (!base) {
    throw new Error('createComponentPreset: base preset is required');
  }

  const id = options.id ?? `${base.id}-composed`;
  const version = options.version ?? base.version;

  const runtime: Record<string, React.ComponentType<any>> = { ...base.runtime };
  const manifest: Record<string, ComponentManifestEntry> = { ...base.manifest };
  const validation: Record<string, ComponentPropsValidator> = { ...base.validation };
  const componentSources: Record<string, string> = { ...base.compiler.componentSources };
  const componentBindings: Record<string, CompilerComponentBinding> = {
    ...base.compiler.componentBindings,
  };

  const seenTypes = new Set<string>();

  for (const ext of extensions) {
    if (!ext || typeof ext !== 'object') {
      throw new Error('createComponentPreset: extension must be an object');
    }
    const type = ext.type;
    if (typeof type !== 'string' || type.length === 0) {
      throw new Error('createComponentPreset: extension.type must be a non-empty string');
    }
    if (seenTypes.has(type)) {
      throw new Error(`createComponentPreset: duplicate extension type "${type}"`);
    }
    seenTypes.add(type);

    if (!ext.component) {
      throw new Error(`createComponentPreset: extension for "${type}" is missing component`);
    }
    if (!ext.manifest) {
      throw new Error(`createComponentPreset: extension for "${type}" is missing manifest`);
    }
    if (!ext.compilerBinding?.module) {
      throw new Error(`createComponentPreset: extension for "${type}" is missing compilerBinding`);
    }
    if (ext.manifest.componentType !== type) {
      throw new Error(
        `createComponentPreset: extension manifest.componentType "${ext.manifest.componentType}" does not match type "${type}"`,
      );
    }
    if (
      !Array.isArray(ext.manifest.allowedProps) ||
      ext.manifest.allowedProps.length === 0 ||
      !ext.manifest.allowedProps.every((p) => typeof p === 'string' && p.length > 0)
    ) {
      throw new Error(
        `createComponentPreset: extension manifest for "${type}" must declare a non-empty allowedProps list`,
      );
    }

    // 冲突检测：如果 base 中已有同名组件且引用不同，抛出明确错误防止静默污染
    if (base.runtime[type] && base.runtime[type] !== ext.component) {
      throw new Error(
        `createComponentPreset: extension component "${type}" conflicts with existing component in base preset "${base.id}"`,
      );
    }

    runtime[type] = ext.component;
    manifest[type] = ext.manifest;
    if (ext.validator) {
      validation[type] = ext.validator;
    }
    componentSources[type] = ext.compilerBinding.module;
    componentBindings[type] = ext.compilerBinding;
  }

  const compiler: CompilerBindings = {
    defaultLibrary: base.compiler.defaultLibrary,
    componentSources,
    componentBindings,
    allowDefaultComponentFallback: base.compiler.allowDefaultComponentFallback,
  };

  return createSealedPreset({
    id,
    version,
    runtime,
    manifest,
    validation,
    compiler,
  });
}
