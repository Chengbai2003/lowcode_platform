import { ComponentMetaRegistry } from './component-meta.registry';
import type { BackendComponentMeta } from './component-meta.types';

/**
 * B4 第二个可信 Preset（@lowcode-platform/preset-test，builtin-test@0.1.0）的
 * 部署侧静态 Agent Meta（Issue #39 / M1F-2 B4）。
 *
 * 仅覆盖该包真实公开的 Container/Text/Button；别名集合与 AntD Meta 完全独立
 * （不含 Btn/Box 等历史别名，反向也不共享 Action/Shell/Caption），用于验证
 * 按 presetId@version 精确查找时 Meta/aliases 不串用。
 *
 * 每个组件显式声明 `allowedProps`（与包内 Manifest allowedProps 完全一致，
 * 由组合测试锁定防漂移）：Agent 写入路径据此拒绝该 Preset 不支持的 Props
 * （例如 AntD 专属的 loading/danger），未声明的内置 AntD Meta 不受影响。
 */
export const TEST_PRESET_REGISTRY: readonly BackendComponentMeta[] = [
  {
    type: 'Container',
    displayName: '测试容器',
    category: 'layout',
    isContainer: true,
    textProps: [],
    properties: [
      { key: 'width', label: '宽度', type: 'select', defaultValue: 'full' },
      { key: 'padding', label: '内边距', type: 'string', defaultValue: '12px' },
      { key: 'center', label: '居中', type: 'boolean', defaultValue: true },
    ],
    allowedProps: [
      'children',
      'className',
      'style',
      'id',
      'title',
      'key',
      'width',
      'padding',
      'center',
    ],
  },
  {
    type: 'Text',
    displayName: '测试文本',
    category: 'typography',
    isContainer: false,
    textProps: ['children'],
    properties: [
      { key: 'children', label: '内容', type: 'string' },
      { key: 'strong', label: '加粗', type: 'boolean', defaultValue: false },
      { key: 'size', label: '字号', type: 'select', defaultValue: 'md' },
    ],
    allowedProps: ['children', 'className', 'style', 'id', 'title', 'key', 'strong', 'size'],
  },
  {
    type: 'Button',
    displayName: '测试按钮',
    category: 'form',
    isContainer: false,
    textProps: ['children'],
    properties: [
      { key: 'children', label: '文字', type: 'string', defaultValue: '按钮' },
      { key: 'variant', label: '变体', type: 'select', defaultValue: 'outline' },
      { key: 'disabled', label: '禁用', type: 'boolean', defaultValue: false },
      { key: 'block', label: '撑满', type: 'boolean', defaultValue: false },
    ],
    allowedProps: [
      'children',
      'className',
      'style',
      'id',
      'title',
      'key',
      'variant',
      'disabled',
      'block',
    ],
  },
];

/** 仅本 Preset 可用的别名（与 AntD 的 Btn/Box/Section 等互不共享）。 */
export const TEST_PRESET_ALIASES = new Map<string, string>([
  ['Shell', 'Container'],
  ['Caption', 'Text'],
  ['Action', 'Button'],
]);

export const BUILTIN_TEST_COMPONENT_META_REGISTRY = new ComponentMetaRegistry(
  TEST_PRESET_REGISTRY,
  TEST_PRESET_ALIASES,
);
