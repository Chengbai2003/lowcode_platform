/**
 * 最小 React Host（Issue #19 / M0-4 Scope A）
 *
 * Renderer 本身只依赖 react；createRoot / 卸载等 DOM 生命周期职责
 * 收敛在 host 子路径（@lowcode-platform/renderer/host），宿主应用
 * 不需要直接接触 Renderer 内部 API。
 *
 * RuntimeSession（pageId + documentSessionId 隔离、dispose）属于
 * Scope D（M0-4d），在该 PR 落地前宿主通过本工厂自行管理挂载生命周期。
 */

import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Renderer } from '../Renderer';
import type { RendererProps } from '../types';

export interface RendererHostHandle {
  /** 用新的 Props 重新渲染（替换整棵渲染树） */
  update(props: RendererProps): void;
  /** 卸载并释放 React root；调用后本 handle 不可再使用 */
  unmount(): void;
  /** 底层 root，供宿主做高级控制（慎用） */
  getRoot(): Root;
}

export function createRendererHost(
  container: HTMLElement,
  initialProps: RendererProps,
): RendererHostHandle {
  const root = createRoot(container);
  let currentProps = initialProps;
  root.render(createElement(Renderer, currentProps));

  return {
    update(props: RendererProps) {
      currentProps = props;
      root.render(createElement(Renderer, currentProps));
    },
    unmount() {
      root.unmount();
    },
    getRoot() {
      return root;
    },
  };
}
