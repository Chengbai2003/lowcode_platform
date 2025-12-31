/**
 * @lowcode-platform/renderer
 *
 * 低代码平台运行时渲染器
 * 将 JSON Schema 渲染为 React 组件
 */

import React from 'react';
import { Renderer } from './Renderer';

export { Renderer } from './Renderer';
export type { ComponentSchema, RendererProps, ComponentRegistry } from './types';
export { builtInComponents } from './Renderer';

/**
 * 从 JSON 字符串渲染的辅助函数
 */
export function renderFromJSON(jsonString: string, components?: Record<string, React.ComponentType<any>>): React.ReactElement {
  const schema = JSON.parse(jsonString);
  return React.createElement(Renderer, { schema, components });
}
