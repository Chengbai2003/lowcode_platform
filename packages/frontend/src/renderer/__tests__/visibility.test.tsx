import { describe, it, expect } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { A2UISchema } from '../../types';
import { LowcodeProvider, Renderer, setComponentData, store } from '../';

const flushMicrotasks = () => new Promise<void>((resolve) => queueMicrotask(() => resolve()));

describe('Renderer visibility', () => {
  it('does not crash when visible toggles to false', async () => {
    const buildSchema = (visible: boolean | string): A2UISchema => ({
      rootId: 'root',
      components: {
        root: {
          id: 'root',
          type: 'Div',
          props: {},
          childrenIds: ['child'],
        },
        child: {
          id: 'child',
          type: 'Input',
          props: {
            visible,
            value: 'x',
          },
        },
      },
    });

    let rerender!: ReturnType<typeof render>['rerender'];
    await act(async () => {
      const renderResult = render(
        <LowcodeProvider>
          <Renderer schema={buildSchema('{{ true }}')} />
        </LowcodeProvider>,
      );
      rerender = renderResult.rerender;
      await flushMicrotasks();
    });

    expect(screen.getByDisplayValue('x')).toBeTruthy();

    await act(async () => {
      rerender(
        <LowcodeProvider>
          <Renderer schema={buildSchema('{{ false }}')} />
        </LowcodeProvider>,
      );
      await flushMicrotasks();
    });

    expect(screen.queryByDisplayValue('x')).toBeNull();
  });

  it('renders without LowcodeProvider', () => {
    const schema: A2UISchema = {
      rootId: 'root',
      components: {
        root: {
          id: 'root',
          type: 'Input',
          props: {
            value: 'standalone',
          },
        },
      },
    };

    render(<Renderer schema={schema} />);

    expect(screen.getByDisplayValue('standalone')).toBeTruthy();
  });

  it('does not use Redux store as the renderer read chain', () => {
    const schema: A2UISchema = {
      rootId: 'root',
      components: {
        root: {
          id: 'root',
          type: 'Input',
          props: {
            value: 'schema-value',
          },
        },
      },
    };

    render(<Renderer schema={schema} />);

    expect(screen.getByDisplayValue('schema-value')).toBeTruthy();

    act(() => {
      store.dispatch(setComponentData({ id: 'root', value: 'redux-only-value' }) as any);
    });

    expect(screen.queryByDisplayValue('redux-only-value')).toBeNull();
    expect(screen.getByDisplayValue('schema-value')).toBeTruthy();
  });
});
