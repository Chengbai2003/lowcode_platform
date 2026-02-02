import React from "react";

/**
 * 扁平化组件节点 (A2UI Protocol)
 */
export interface A2UIComponent {
  id: string;
  type: string; // 组件类型，如 "Button", "Container"
  props?: Record<string, any>; // 静态属性
  childrenIds?: string[]; // 子节点 ID 列表
  events?: Record<string, string>; // 事件定义
}

/**
 * 整个页面数据 (A2UI Response)
 */
export interface A2UISchema {
  rootId: string; // 入口节点 ID
  components: Record<string, A2UIComponent>; // 组件池：ID -> Component
}

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
