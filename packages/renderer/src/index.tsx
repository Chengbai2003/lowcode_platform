/**
 * @lowcode-platform/renderer
 *
 * 低代码平台运行时渲染器
 * 将 JSON Schema 渲染为 React 组件
 */

import React from 'react';
import { Provider } from 'react-redux';
import { Renderer } from './Renderer';
import { store } from './store';

export { Renderer } from './Renderer';
export { EventDispatcher } from './Renderer';
export type { ComponentSchema, RendererProps, ComponentRegistry } from './types';
export { builtInComponents } from './Renderer';

// 导出 Redux 相关
export { store } from './store';
export { useAppDispatch, useAppSelector } from './store/hooks';
export { setComponentData, setMultipleComponentData, clearComponentData, setComponentConfig, resetAllData } from './store/componentSlice';

/**
 * Redux Provider 包装组件
 */
export const LowcodeProvider = ({ children }: { children: React.ReactNode }) => {
  return <Provider store={store}>{children}</Provider>;
};

/**
 * 从 JSON 字符串渲染的辅助函数
 */
export function renderFromJSON(jsonString: string, components?: Record<string, React.ComponentType<any>>): React.ReactElement {
  const schema = JSON.parse(jsonString);
  return React.createElement(Renderer, { schema, components });
}
