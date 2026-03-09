import React from 'react';
import type { A2UIComponent, A2UISchema } from './schema';

/**
 * 组件注册表类型
 */
export type ComponentRegistry = Record<string, React.ComponentType<any>>;

/**
 * 渲染器组件的 Props 类型
 */
export interface RendererProps {
  schema: A2UISchema; // JSON Schema (严格 A2UI)
  components?: ComponentRegistry; // 自定义组件注册表
  onComponentClick?: (node: A2UIComponent) => void; // 组件点击回调
  eventContext?: Record<string, any>; // 事件执行上下文
}
