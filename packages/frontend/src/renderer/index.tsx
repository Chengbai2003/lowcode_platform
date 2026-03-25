/**
 * @lowcode-platform/renderer
 *
 * 低代码平台运行时渲染器
 * 将 JSON Schema 渲染为 React 组件
 */

import React from 'react';
import { Renderer } from './Renderer';

export { Renderer } from './Renderer';
export { EventDispatcher } from './EventDispatcher';
export type { RendererProps, ComponentRegistry, A2UIComponent, A2UISchema } from './types';
export { builtInComponents } from './builtInComponents';

// 导出表单验证相关
export {
  validateSchema,
  safeValidateSchema,
  validateSchemaWithWhitelist,
  validateAndAutoFix,
} from './utils/schema-validator';
export { autoFixSchema } from './utils/schema-auto-fix';

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
  const schema = JSON.parse(jsonString);
  return React.createElement(Renderer, { schema, components });
}
