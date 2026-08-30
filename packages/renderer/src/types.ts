import React from 'react';
import type { ComponentNode, PageSchema } from '@lowcode-platform/schema-contract';
import type { ComponentPreset } from './preset/types';
import type { HostCapabilities } from './host/HostCapabilities';

export type { ComponentNode, PageSchema } from '@lowcode-platform/schema-contract';

/**
 * 组件注册表类型（自前端 src/types/registry.ts 迁入，Issue #19 / M0-4 Scope A）
 */
export type ComponentRegistry = Record<string, React.ComponentType<any>>;

/**
 * 渲染器组件的 Props 类型
 */
export interface RendererProps {
  schema: PageSchema; // JSON Schema (严格 A2UI)
  components?: ComponentRegistry; // 宿主自定义组件注册表（可覆盖 Preset 组件）
  preset?: ComponentPreset; // 单一 ComponentPreset（M0-4 Scope B：一个 Host 只绑定一个）
  pageId?: string; // M0-4 Scope D：提供 pageId + documentSessionId 时按挂载创建 RuntimeSession
  documentSessionId?: string; // 变化或卸载时销毁旧 Session（异步回调不得写回新页面）
  hostCapabilities?: Partial<HostCapabilities> | null; // M0-4 Scope E：宿主能力显式授予（默认全 deny）
  onComponentClick?: (node: ComponentNode) => void; // 组件点击回调
  eventContext?: Record<string, any>; // 事件执行上下文
}
