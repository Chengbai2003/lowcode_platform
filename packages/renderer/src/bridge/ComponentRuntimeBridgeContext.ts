import { createContext, useContext } from 'react';
import type { ComponentRuntimeBridge } from './ComponentRuntimeBridge';

/**
 * 桥通过 React Context 注入：Renderer 在挂载时提供 Provider，
 * 组件用 useComponentRuntimeBridge 消费。
 */
export const ComponentRuntimeBridgeContext = createContext<ComponentRuntimeBridge | null>(null);
ComponentRuntimeBridgeContext.displayName = 'ComponentRuntimeBridgeContext';

/**
 * 获取当前渲染树注入的组件运行时桥。
 * 在 Renderer 之外直接渲染组件时返回 null（组件需自行降级，如禁用交互按钮）。
 */
export function useComponentRuntimeBridge(): ComponentRuntimeBridge | null {
  return useContext(ComponentRuntimeBridgeContext);
}
