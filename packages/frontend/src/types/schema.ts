import type { ActionList } from './dsl';

/**
 * 事件配置类型
 * 直接以 trigger 为 key，actions 为 value
 * 例如：{ onClick: [...], onChange: [...] }
 */
export type EventConfig = Record<string, ActionList>;

/**
 * 扁平化组件节点 (A2UI Protocol)
 */
export interface A2UIComponent {
  id: string;
  type: string; // 组件类型，如 "Button", "Container"
  props?: Record<string, unknown>; // 静态属性
  childrenIds?: string[]; // 子节点 ID 列表
  events?: EventConfig; // 事件定义：{ [trigger]: Action[] }
}

/**
 * 整个页面数据 (A2UI Response)
 */
export interface A2UISchema {
  version?: number; // Schema 版本号，默认 1
  rootId: string; // 入口节点 ID
  components: Record<string, A2UIComponent>; // 组件池：ID -> Component
}
