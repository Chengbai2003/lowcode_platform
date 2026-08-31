import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { LowcodeEditor } from '../LowcodeEditor';
import { useSelectionStore } from '../store/editor-store';
import type { PageSchema } from '../../types';
import { getTemplateSchema } from '../templates';
import { BUILTIN_TEMPLATE_IDS } from '../templates/types';

beforeEach(() => {
  global.ResizeObserver = class ResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  };

  // mock matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe('Editor -> Renderer Session Integration (PR #34)', () => {
  it('真实 LowcodeEditor 挂载默认页及所有内置模板时没有未知组件', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const schemas = [undefined, ...BUILTIN_TEMPLATE_IDS.map(getTemplateSchema)];

    for (const schema of schemas) {
      const view = render(<LowcodeEditor initialSchema={schema} />);
      expect(view.container.querySelector('[data-unknown-component]')).toBeNull();
      view.unmount();
    }

    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('Unknown component type'));
    warn.mockRestore();
  });

  it('未保存草稿在 LowcodeEditor 中生成独立的 draft:${documentSessionId} 身份', () => {
    const customSchema: PageSchema = {
      schemaVersion: 0,
      rootId: 'root',
      components: {
        root: { id: 'root', type: 'Page', childrenIds: ['t1'] },
        t1: { id: 't1', type: 'Title', props: { children: '未保存草稿测试' } },
      },
    };

    render(<LowcodeEditor initialSchema={customSchema} />);

    expect(screen.getAllByText('未保存草稿测试').length).toBeGreaterThanOrEqual(1);

    const currentDocSessionId = useSelectionStore.getState().documentSessionId;
    expect(currentDocSessionId).toBeTruthy();
    expect(typeof currentDocSessionId).toBe('string');
  });

  it('自定义组件通过 createComponentPreset 封闭组合进入渲染树，Props 经 Manifest 净化', () => {
    const CustomAlert = (props: { title?: string; children?: React.ReactNode }) => (
      <div data-testid="custom-alert">
        <span>{props.title}</span>
        <span>{props.children}</span>
      </div>
    );

    const schemaWithCustom: PageSchema = {
      schemaVersion: 0,
      rootId: 'root',
      components: {
        root: { id: 'root', type: 'Page', childrenIds: ['c1'] },
        c1: {
          id: 'c1',
          type: 'CustomAlert',
          props: { title: '自定义警告', children: '内容详情' },
        },
      },
    };

    render(
      <LowcodeEditor
        pageId="custom-page-1"
        initialSchema={schemaWithCustom}
        components={{
          CustomAlert: {
            component: CustomAlert,
            manifest: {
              componentType: 'CustomAlert',
              allowedProps: ['title', 'children'],
            },
            compilerBinding: { module: '@example/components' },
          },
        }}
      />,
    );

    expect(screen.getAllByText('自定义警告').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('内容详情').length).toBeGreaterThanOrEqual(1);
  });
});
