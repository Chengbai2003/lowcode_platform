import { testRuntime } from './runtime';
import type { ComponentManifestRegistry } from '@lowcode-platform/renderer';

/**
 * Manifest 的独立修订号。变更 Props 白名单或 Manifest 语义时必须同步递增；
 * 它不能由 ComponentPreset 版本代替，因为两者可以独立演进。
 */
export const TEST_MANIFEST_VERSION = '1';

const COMMON = ['children', 'className', 'style', 'id', 'title', 'key'] as const;

const componentProps: Record<string, readonly string[]> = {
  Container: ['width', 'padding', 'center'],
  Text: ['strong', 'size'],
  Button: ['variant', 'disabled', 'block'],
};

function entry(componentType: string, allowedProps: readonly string[]) {
  return Object.freeze({
    componentType,
    allowedProps: Object.freeze([...COMMON, ...allowedProps]),
  });
}

export const testManifest: ComponentManifestRegistry = Object.freeze(
  Object.fromEntries(
    Object.keys(testRuntime).map((type) => [type, entry(type, componentProps[type] ?? [])]),
  ),
);
