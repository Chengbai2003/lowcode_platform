/**
 * @lowcode-platform/preset-antd/manifest
 *
 * AntD Preset 的组件 Manifest（Issue #19 / M0-4 Scope B）。
 * allowedProps 为 Props 白名单：渲染前经 Manifest 净化，白名单外的
 * Props（连同函数型 Props 与危险 DOM Props）一律 fail-close 移除。
 *
 * value/value 类字段来自渲染器的受控值管道（useNodeValue），
 * 因此对所有可绑定类型放行；白名单按 Preset 自身组件实现的真实
 * 消费面枚举。
 */

import type { ComponentManifestRegistry } from '@lowcode-platform/renderer';

const COMMON_DOM_PROPS = [
  'style',
  'className',
  'id',
  'title',
  'value',
  'children',
  'initialValue',
  'initialValues',
  'key',
] as const;

function entry(componentType: string, allowedProps: string[]) {
  return Object.freeze({
    componentType,
    allowedProps: Object.freeze([...COMMON_DOM_PROPS, 'value', ...allowedProps]),
  });
}

export const antdManifest: ComponentManifestRegistry = Object.freeze({
  Page: entry('Page', []),
  Div: entry('Div', []),
  Span: entry('Span', []),
  Container: entry('Container', []),
  Row: entry('Row', ['gutter', 'justify', 'align', 'wrap']),
  Col: entry('Col', [
    'span',
    'offset',
    'flex',
    'order',
    'pull',
    'push',
    'xs',
    'sm',
    'md',
    'lg',
    'xl',
    'xxl',
  ]),
  Text: entry('Text', [
    'strong',
    'type',
    'code',
    'mark',
    'underline',
    'delete',
    'keyboard',
    'ellipsis',
  ]),
  Title: entry('Title', ['level', 'code', 'mark', 'type', 'underline', 'delete', 'ellipsis']),
  Paragraph: entry('Paragraph', [
    'strong',
    'type',
    'code',
    'mark',
    'underline',
    'delete',
    'ellipsis',
  ]),
  Input: entry('Input', [
    'placeholder',
    'type',
    'name',
    'defaultValue',
    'disabled',
    'size',
    'allowClear',
    'maxLength',
    'readOnly',
  ]),
  Button: entry('Button', ['type', 'name', 'disabled', 'danger', 'block', 'size', 'htmlType']),

  TextArea: entry('TextArea', [
    'placeholder',
    'name',
    'rows',
    'defaultValue',
    'disabled',
    'maxLength',
    'readOnly',
  ]),
  Image: entry('Image', ['src', 'alt', 'width', 'height']),
  Link: entry('Link', ['href', 'target', 'rel']),
});
