/**
 * @lowcode-platform/renderer
 *
 * A2UI 低代码平台运行时渲染器（Issue #19 / M0-4 Scope A）
 * 将 Contract 校验通过的 JSON Schema 渲染为 React 组件。
 *
 * 边界约束：
 * - 不依赖 Editor / AI Assistant / PropertyPanel（由架构门禁强制）；
 * - React / ReactDOM 为 peerDependencies；
 * - 渲染入口只接受 Contract 返回的 canonical Schema（fail-close）；
 * - 不把任何运行时对象挂到可变 window 全局。
 */

import { requireSupportedPageSchema } from '@lowcode-platform/schema-contract';
import React from 'react';
import { Renderer } from './Renderer';

// 公开命名导出统一使用 export *（叶子模块内部为直接赋值，Rollup/Vite 的 CJS
// 命名导出静态分析可识别）。注意不要改回 `export { X } from './y'`：
// tsc 会把它编译成 getter 式 Object.defineProperty，宿主 vite build 会报
// "X is not exported by"。
export * from './Renderer';
export * from './EventDispatcher';
export * from './builtInComponents';
export * from './executor';
export * from './executor/parser/expressionParser';
export * from './executor/parser/valueResolver';
export * from './utils/schema-validator';
export * from './utils/schema-auto-fix';
export * from './schemaValidation';
export * from './bridge/ComponentRuntimeBridgeContext';
export * from './bridge/createComponentRuntimeBridge';
export type { ComponentRuntimeBridge, DataResourceState } from './bridge/ComponentRuntimeBridge';
export type { RendererProps, ComponentRegistry, ComponentNode, PageSchema } from './types';

// 稳定公开别名：宿主只应依赖 PageRenderer 这个名字。
// 本地绑定（而非 import 再导出）确保编译为直接赋值。
const PageRenderer = Renderer;
export { PageRenderer };

/**
 * 兼容保留的 Provider 包装组件。
 * Renderer 已不再依赖 Redux，上层继续包裹不会影响运行。
 */
export const LowcodeProvider = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>;
};

/**
 * 从 JSON 字符串渲染的辅助函数
 */
export function renderFromJSON(
  jsonString: string,
  components?: Record<string, React.ComponentType<any>>,
): React.ReactElement {
  const raw = JSON.parse(jsonString);
  // Contract 边界：只渲染 Contract 返回的 canonical Schema（不支持版本/畸形结构 fail-close）
  const schema = requireSupportedPageSchema(raw);
  return React.createElement(Renderer, { schema, components });
}
