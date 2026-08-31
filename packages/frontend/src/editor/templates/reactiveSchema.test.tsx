import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Renderer } from '@lowcode-platform/renderer';
import { getTemplateSchema } from './index';
import { BUILTIN_TEMPLATE_IDS } from './types';
import { createDefaultReactiveSchema } from './reactiveSchema';
import { formContactTemplate } from './templates/form-contact';
import { antdPreset } from '@lowcode-platform/preset-antd';

const flushMicrotasks = () => new Promise<void>((resolve) => queueMicrotask(() => resolve()));

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

describe('reactive template schemas', () => {
  it('built-in preset covers every component used by the default page and templates', () => {
    const schemas = [createDefaultReactiveSchema(), ...BUILTIN_TEMPLATE_IDS.map(getTemplateSchema)];
    for (const schema of schemas) {
      expect(schema).toBeTruthy();
      for (const node of Object.values(schema!.components) as Array<{ type: string }>) {
        expect(antdPreset.runtime[node.type], `runtime for ${node.type}`).toBeDefined();
        expect(antdPreset.manifest[node.type], `manifest for ${node.type}`).toBeDefined();
        expect(
          antdPreset.compiler.componentSources[node.type],
          `compiler binding for ${node.type}`,
        ).toBeDefined();
      }
    }
  });

  it('default schema updates preview copy when form values change', async () => {
    render(
      <Renderer
        preset={antdPreset}
        schema={createDefaultReactiveSchema()}
        pageId="template-page-1"
        documentSessionId="doc-1"
      />,
    );

    expect(screen.getByText('你好，A2UI')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('输入页面名称体验实时联动'), {
      target: { value: '审批中心' },
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(screen.getByText('你好，审批中心')).toBeInTheDocument();
    expect(screen.getByText(/审批中心 已切换到 产品经理 模式/)).toBeInTheDocument();
  });

  it('getTemplateSchema returns isolated schema clones', () => {
    const first = getTemplateSchema('dashboard-basic');
    const second = getTemplateSchema('dashboard-basic');

    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(first).not.toBe(second);

    (first!.components['dash-title'].props as Record<string, unknown>).children = 'mutated';

    expect((second!.components['dash-title'].props as Record<string, unknown>).children).toBe(
      '{{ dashboardScene.title }}',
    );
  });

  it('dashboard template reacts to quick action updates', async () => {
    const schema = getTemplateSchema('dashboard-basic');
    expect(schema).toBeTruthy();

    render(
      <Renderer
        preset={antdPreset}
        schema={schema!}
        pageId="template-page-2"
        documentSessionId="doc-1"
      />,
    );

    expect(screen.getByText('工作台')).toBeInTheDocument();
    expect(screen.getByText('24,593')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '发布新商品' }));

    await act(async () => {
      await flushMicrotasks();
    });

    expect(screen.getByText('商品运营工作台')).toBeInTheDocument();
    expect(screen.getByText('26,108')).toBeInTheDocument();
    expect(screen.getByText('完成新品上架并同步首页推荐位')).toBeInTheDocument();
  });

  it('contact form updates form-backed expressions when textarea changes', async () => {
    const schema = JSON.parse(JSON.stringify(formContactTemplate.schema));
    schema.components['btn-submit'].props = {
      ...(schema.components['btn-submit'].props as Record<string, unknown>),
      visible: '{{ contactForm.message == 1 }}',
    };

    render(
      <Renderer
        preset={antdPreset}
        schema={schema}
        pageId="template-page-3"
        documentSessionId="doc-1"
      />,
    );

    expect(screen.queryByRole('button', { name: '提交信息' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('请详细描述您的需求...'), {
      target: { value: '1' },
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(screen.getByText('消息摘要：1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '提交信息' })).toBeInTheDocument();
  });

  it('preserves live form data when schema props change on the same page', async () => {
    const baseSchema = JSON.parse(JSON.stringify(formContactTemplate.schema));
    const { rerender } = render(
      <Renderer
        preset={antdPreset}
        schema={baseSchema}
        pageId="template-page-4"
        documentSessionId="doc-1"
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('请详细描述您的需求...'), {
      target: { value: '1' },
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(screen.getByText('消息摘要：1')).toBeInTheDocument();

    const nextSchema = JSON.parse(JSON.stringify(baseSchema));
    nextSchema.components['btn-submit'].props = {
      ...(nextSchema.components['btn-submit'].props as Record<string, unknown>),
      visible: '{{ contactForm.message == 1 }}',
    };

    rerender(
      <Renderer
        preset={antdPreset}
        schema={nextSchema}
        pageId="template-page-4"
        documentSessionId="doc-1"
      />,
    );

    await act(async () => {
      await flushMicrotasks();
    });

    expect(screen.getByText('消息摘要：1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '提交信息' })).toBeInTheDocument();
  });
});
