import React from 'react';
import type { ComponentNode, PageSchema } from '@lowcode-platform/schema-contract';
import type { ComponentPreset } from './preset/types';
import type { HostCapabilities } from './host/HostCapabilities';

export type { ComponentNode, PageSchema } from '@lowcode-platform/schema-contract';
export type {
  ComponentPreset,
  ComponentManifestEntry,
  ComponentManifestRegistry,
  ComponentPropsValidator,
  ComponentValidationRegistry,
  CompilerBindings,
  ComponentCompilerRegistry,
} from './preset/types';
export type {
  ComponentPresetExtension,
  PresetCompositionOptions,
} from './preset/createComponentPreset';

/**
 * 组件注册表类型（自前端 src/types/registry.ts 迁入，Issue #19 / M0-4 Scope A）
 */
export type ComponentRegistry = Record<string, React.ComponentType<any>>;

/**
 * 渲染器组件的 Props 类型（Issue #19 / M0-4 Scope A/B/D）
 */
export interface RendererProps {
  readonly schema: PageSchema; // JSON Schema (严格 A2UI canonical)
  readonly preset: ComponentPreset; // 单一封闭 ComponentPreset（必须注入，Host 负责组合）
  readonly pageId: string; // 页面标识（绑定 RuntimeSession 身份）
  readonly documentSessionId: string; // 文档会话标识（切换或卸载时销毁旧 Session，防范异步回调串台）
  readonly hostCapabilities?: Partial<HostCapabilities> | null; // M0-4 Scope E：宿主能力显式授予（默认全 deny）
  readonly onComponentClick?: (node: ComponentNode) => void; // 组件点击回调
  readonly eventContext?: Record<string, unknown>; // 事件执行上下文
}
