import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { componentRegistry } from '../../components';
import { Renderer } from '../../renderer';
import { getTemplateSchema } from './index';
import { createDefaultReactiveSchema } from './reactiveSchema';
import { formContactTemplate } from './templates/form-contact';

const flushMicrotasks = () => new Promise<void>((resolve) => queueMicrotask(() => resolve()));
const testComponents = Object.fromEntries(
  Object.entries(componentRegistry).map(([key, entry]) => [key, entry.component]),
);

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
  it('default schema updates preview copy when form values change', async () => {
    render(<Renderer schema={createDefaultReactiveSchema()} components={testComponents} />);

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

    render(<Renderer schema={schema!} components={testComponents} />);

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

    render(<Renderer schema={schema} components={testComponents} />);

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
    const { rerender } = render(<Renderer schema={baseSchema} components={testComponents} />);

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

    rerender(<Renderer schema={nextSchema} components={testComponents} />);

    await act(async () => {
      await flushMicrotasks();
    });

    expect(screen.getByText('消息摘要：1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '提交信息' })).toBeInTheDocument();
  });
});
