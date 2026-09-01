import type { ComponentPreset } from './types';

/**
 * Bootstrap 阶段构建并 seal 一个 ComponentPreset（Issue #19 / M0-4 Scope B）
 *
 * - 构建即校验：runtime 中每个组件必须有 Manifest 条目（fail-close，
 *   缺 Manifest 的组件不允许进入 Preset）；
 * - seal 后整棵结构深冻结：Registry 无法被运行时组件修改；
 * - 不提供任何 register() / 可变 Map 出口。
 */
export function createSealedPreset(input: {
  id: string;
  version: string;
  runtime: ComponentPreset['runtime'];
  manifest: ComponentPreset['manifest'];
  validation?: ComponentPreset['validation'];
  compiler: ComponentPreset['compiler'];
}): ComponentPreset {
  const { id, version, runtime, manifest } = input;
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('createSealedPreset: preset id must be a non-empty string');
  }
  if (typeof version !== 'string' || version.length === 0) {
    throw new Error('createSealedPreset: preset version must be a non-empty string');
  }

  const runtimeKeys = Object.keys(runtime);
  if (runtimeKeys.length === 0) {
    throw new Error('createSealedPreset: runtime registry must not be empty');
  }

  for (const type of runtimeKeys) {
    const entry = manifest[type];
    if (!entry) {
      throw new Error(
        `createSealedPreset: component "${type}" has no manifest entry (fail-close at bootstrap)`,
      );
    }
    if (entry.componentType !== type) {
      throw new Error(
        `createSealedPreset: manifest entry key "${type}" does not match componentType "${entry.componentType}"`,
      );
    }
    if (
      !Array.isArray(entry.allowedProps) ||
      entry.allowedProps.length === 0 ||
      !entry.allowedProps.every((prop) => typeof prop === 'string' && prop.length > 0)
    ) {
      throw new Error(
        `createSealedPreset: manifest entry for "${type}" must declare a non-empty allowedProps list`,
      );
    }
  }

  const validation = input.validation ?? {};
  for (const type of Object.keys(validation)) {
    if (!runtime[type]) {
      throw new Error(
        `createSealedPreset: validation hook for unknown component "${type}" (not in runtime)`,
      );
    }
    if (typeof validation[type] !== 'function') {
      throw new Error(`createSealedPreset: validation hook for "${type}" must be a function`);
    }
  }

  const compiler = input.compiler;
  if (typeof compiler?.defaultLibrary !== 'string' || compiler.defaultLibrary.length === 0) {
    throw new Error('createSealedPreset: compiler.defaultLibrary must be a non-empty string');
  }
  if (!compiler.componentSources || typeof compiler.componentSources !== 'object') {
    throw new Error('createSealedPreset: compiler.componentSources must be an object');
  }
  for (const [type, source] of Object.entries(compiler.componentSources)) {
    if (!runtime[type]) {
      throw new Error(
        `createSealedPreset: compiler binding for unknown component "${type}" (not in runtime)`,
      );
    }
    if (typeof source !== 'string' || source.length === 0) {
      throw new Error(
        `createSealedPreset: compiler binding for "${type}" must be a non-empty module specifier`,
      );
    }
  }
  for (const [type, binding] of Object.entries(compiler.componentBindings ?? {})) {
    if (
      !runtime[type] ||
      !binding ||
      typeof binding.module !== 'string' ||
      binding.module.length === 0
    ) {
      throw new Error(`createSealedPreset: invalid complete compiler binding for "${type}"`);
    }
  }

  // ---- seal：深冻结，运行时不可变 ----
  const frozenRuntime = Object.freeze({ ...runtime });
  const frozenManifest = Object.freeze(
    Object.fromEntries(
      Object.entries(manifest).map(([type, entry]) => [
        type,
        Object.freeze({ ...entry, allowedProps: Object.freeze([...entry.allowedProps]) }),
      ]),
    ),
  ) as ComponentPreset['manifest'];
  const frozenValidation = Object.freeze({ ...(input.validation ?? {}) });
  const frozenCompiler = Object.freeze({
    defaultLibrary: compiler.defaultLibrary,
    componentSources: Object.freeze({ ...compiler.componentSources }),
    componentBindings: Object.freeze(
      Object.fromEntries(
        Object.entries(compiler.componentBindings ?? {}).map(([type, binding]) => [
          type,
          Object.freeze({ ...binding }),
        ]),
      ),
    ),
    allowDefaultComponentFallback: compiler.allowDefaultComponentFallback,
  });

  return Object.freeze({
    id,
    version,
    runtime: frozenRuntime,
    manifest: frozenManifest,
    validation: frozenValidation,
    compiler: frozenCompiler,
  });
}
