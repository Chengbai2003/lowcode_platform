import { testRuntime } from './runtime';
import type { CompilerBindings } from '@lowcode-platform/renderer';

/**
 * Compiler 绑定必须指向本包真实存在的子路径导出（exports map 中的
 * `./runtime`），生成代码的 import 语句据此解析到实际模块。
 * 未知组件禁止回退到默认库（fail-close，与 preset-antd 一致）。
 */
const RUNTIME_MODULE = '@lowcode-platform/preset-test/runtime';

export const testCompilerBindings: CompilerBindings = Object.freeze({
  defaultLibrary: RUNTIME_MODULE,
  allowDefaultComponentFallback: false,
  componentSources: Object.freeze(
    Object.fromEntries(Object.keys(testRuntime).map((type) => [type, RUNTIME_MODULE])),
  ),
  componentBindings: Object.freeze(
    Object.fromEntries(
      Object.keys(testRuntime).map((type) => [type, Object.freeze({ module: RUNTIME_MODULE })]),
    ),
  ),
});
