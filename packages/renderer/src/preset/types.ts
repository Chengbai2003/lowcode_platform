import type { ComponentRegistry } from '../types';

/**
 * 单个组件的 Manifest 条目（Issue #19 / M0-4 Scope B）
 *
 * 声明该组件允许接收的 Props 白名单。不在白名单内的 Props 在渲染前被
 * 净化移除（fail-close），永不抵达组件实现。
 */
export interface ComponentManifestEntry {
  readonly componentType: string;
  readonly allowedProps: readonly string[];
}

/** Preset 的组件 Manifest 注册表（seal 后只读） */
export type ComponentManifestRegistry = Readonly<Record<string, ComponentManifestEntry>>;

/**
 * 组件级校验钩子：接收原始 Props 与 Manifest 条目，返回净化后的 Props。
 * 抛错表示该组件拒绝当前 Props（fail-close，组件不会被渲染）。
 */
export type ComponentPropsValidator = (
  props: Record<string, unknown>,
  entry: ComponentManifestEntry,
) => Record<string, unknown>;

/** Preset 的组件 Validation 注册表（seal 后只读） */
export type ComponentValidationRegistry = Readonly<Record<string, ComponentPropsValidator>>;

/**
 * Compiler 绑定：告知代码生成器每个组件类型的 import 来源。
 * 未命中的类型回落到 defaultLibrary。
 */
export interface CompilerBindings {
  readonly defaultLibrary: string;
  readonly componentSources: Readonly<Record<string, string>>;
}

/** Preset 的 Compiler 绑定注册表（seal 后只读） */
export type ComponentCompilerRegistry = CompilerBindings;

/**
 * 单一 ComponentPreset（Issue #19 / M0-4 Scope B）
 *
 * 一个 Renderer Host 只能绑定一个 Preset；Registry 仅在 Bootstrap 阶段
 * 经 createSealedPreset 构建并 seal，不暴露可变 Map 或运行时 register()。
 */
export interface ComponentPreset {
  readonly id: string;
  readonly version: string;
  readonly runtime: ComponentRegistry;
  readonly manifest: ComponentManifestRegistry;
  readonly validation: ComponentValidationRegistry;
  readonly compiler: ComponentCompilerRegistry;
}
