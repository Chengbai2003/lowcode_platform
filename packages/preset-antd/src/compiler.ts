import { antdRuntime } from './runtime';
import type { CompilerBindings } from '@lowcode-platform/renderer';

const RUNTIME_MODULE = '@lowcode-platform/preset-antd/runtime';

export const antdCompilerBindings: CompilerBindings = Object.freeze({
  defaultLibrary: 'antd',
  allowDefaultComponentFallback: false,
  componentSources: Object.freeze(
    Object.fromEntries(Object.keys(antdRuntime).map((type) => [type, RUNTIME_MODULE])),
  ),
  componentBindings: Object.freeze(
    Object.fromEntries(
      Object.keys(antdRuntime).map((type) => [type, Object.freeze({ module: RUNTIME_MODULE })]),
    ),
  ),
});
