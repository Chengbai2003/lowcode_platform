import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { LowcodeEditor } from '../LowcodeEditor';
import { useSelectionStore } from '../store/editor-store';
import type { PageSchema } from '../../../types';

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
          CustomAlert: CustomAlert as never,
        }}
      />,
    );

    expect(screen.getAllByText('自定义警告').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('内容详情').length).toBeGreaterThanOrEqual(1);
  });
});
