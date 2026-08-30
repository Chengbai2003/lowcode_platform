/**
 * 测试用最小 Preset（Issue #19 / M0-4 Scope B）
 *
 * 证明“新增测试 Preset 不修改 Renderer 源码”：本文件完全通过
 * createSealedPreset 公共 API 构建纯 HTML 组件的 Preset，
 * Renderer 主流程零改动。Renderer 包测试使用它替代内置组件。
 */

import React from 'react';
import { createSealedPreset, type ComponentPreset } from '../../preset/createSealedPreset';
import type { ComponentManifestRegistry } from '../../preset/types';
import type { ComponentRegistry } from '../../types';

const htmlRuntime: ComponentRegistry = {
  Page: ({ children, ...props }: React.ComponentProps<any>) => <div {...props}>{children}</div>,
  Div: ({ children, ...props }: React.ComponentProps<any>) => <div {...props}>{children}</div>,
  Span: ({ children, ...props }: React.ComponentProps<any>) => <span {...props}>{children}</span>,
  Container: ({ children, ...props }: React.ComponentProps<any>) => (
    <section {...props}>{children}</section>
  ),
  Row: ({ children, ...props }: React.ComponentProps<any>) => (
    <div style={{ display: 'flex' }} {...props}>
      {children}
    </div>
  ),
  Col: ({ children, ...props }: React.ComponentProps<any>) => <div {...props}>{children}</div>,
  Text: ({ children, ...props }: React.ComponentProps<any>) => <span {...props}>{children}</span>,
  Title: ({ children, level = 1, ...props }: React.ComponentProps<any>) => {
    const Tag = `h${Math.min(Math.max(Number(level) || 1, 1), 6)}` as 'h1';
    return <Tag {...props}>{children}</Tag>;
  },
  Paragraph: ({ children, ...props }: React.ComponentProps<any>) => <p {...props}>{children}</p>,
  Input: (props: React.ComponentProps<any>) => <input {...props} />,
  Button: ({ children, ...props }: React.ComponentProps<any>) => (
    <button {...props}>{children}</button>
  ),
  TextArea: (props: React.ComponentProps<any>) => <textarea {...props} />,
  Image: ({ src, alt, ...props }: React.ComponentProps<any>) => (
    <img src={src} alt={alt} {...props} />
  ),
  Link: ({ children, href, ...props }: React.ComponentProps<any>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
};

const COMMON = ['style', 'className', 'id', 'title', 'value', 'children'];

const manifest: ComponentManifestRegistry = Object.freeze({
  Page: Object.freeze({ componentType: 'Page', allowedProps: Object.freeze([...COMMON]) }),
  Div: Object.freeze({ componentType: 'Div', allowedProps: Object.freeze([...COMMON]) }),
  Span: Object.freeze({ componentType: 'Span', allowedProps: Object.freeze([...COMMON]) }),
  Container: Object.freeze({
    componentType: 'Container',
    allowedProps: Object.freeze([...COMMON]),
  }),
  Row: Object.freeze({ componentType: 'Row', allowedProps: Object.freeze([...COMMON]) }),
  Col: Object.freeze({ componentType: 'Col', allowedProps: Object.freeze([...COMMON]) }),
  Text: Object.freeze({ componentType: 'Text', allowedProps: Object.freeze([...COMMON]) }),
  Title: Object.freeze({
    componentType: 'Title',
    allowedProps: Object.freeze([...COMMON, 'level']),
  }),
  Paragraph: Object.freeze({
    componentType: 'Paragraph',
    allowedProps: Object.freeze([...COMMON]),
  }),
  Input: Object.freeze({
    componentType: 'Input',
    allowedProps: Object.freeze([
      ...COMMON,
      'placeholder',
      'type',
      'name',
      'initialValue',
      'defaultValue',
      'disabled',
      'readOnly',
      'maxLength',
    ]),
  }),
  Button: Object.freeze({
    componentType: 'Button',
    allowedProps: Object.freeze([...COMMON, 'type', 'name', 'disabled', 'danger', 'block']),
  }),
  TextArea: Object.freeze({
    componentType: 'TextArea',
    allowedProps: Object.freeze([
      ...COMMON,
      'placeholder',
      'name',
      'rows',
      'initialValue',
      'defaultValue',
      'disabled',
      'maxLength',
      'readOnly',
    ]),
  }),
  Image: Object.freeze({
    componentType: 'Image',
    allowedProps: Object.freeze([...COMMON, 'src', 'alt', 'width', 'height']),
  }),
  Link: Object.freeze({
    componentType: 'Link',
    allowedProps: Object.freeze([...COMMON, 'href', 'target', 'rel']),
  }),
});

export const testPreset: ComponentPreset = createSealedPreset({
  id: 'test-html',
  version: '0.0.0-test',
  runtime: htmlRuntime,
  manifest,
  compiler: Object.freeze({
    defaultLibrary: 'react',
    componentSources: Object.freeze({}),
  }),
});
