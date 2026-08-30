import { describe, it, expect } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { PageSchema } from '@lowcode-platform/schema-contract';
import { LowcodeProvider, Renderer } from '../';
import { testPreset } from './fixtures/testPreset';

const flushMicrotasks = () => new Promise<void>((resolve) => queueMicrotask(() => resolve()));

describe('Renderer visibility', () => {
  it('does not crash when visible toggles to false', async () => {
    const buildSchema = (visible: boolean | string): PageSchema => ({
      schemaVersion: 0,
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
          <Renderer preset={testPreset} schema={buildSchema('{{ true }}')} />
        </LowcodeProvider>,
      );
      rerender = renderResult.rerender;
      await flushMicrotasks();
    });

    expect(screen.getByDisplayValue('x')).toBeTruthy();

    await act(async () => {
      rerender(
        <LowcodeProvider>
          <Renderer preset={testPreset} schema={buildSchema('{{ false }}')} />
        </LowcodeProvider>,
      );
      await flushMicrotasks();
    });

    expect(screen.queryByDisplayValue('x')).toBeNull();
  });

  it('renders without LowcodeProvider', () => {
    const schema: PageSchema = {
      schemaVersion: 0,
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

    render(<Renderer preset={testPreset} schema={schema} />);

    expect(screen.getByDisplayValue('standalone')).toBeTruthy();
  });

  it('does not use host getState as the renderer read chain', () => {
    const schema: PageSchema = {
      schemaVersion: 0,
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

    const getState = () => ({
      components: {
        data: {
          root: 'host-only-value',
        },
      },
    });

    render(<Renderer preset={testPreset} schema={schema} eventContext={{ getState }} />);

    expect(screen.getByDisplayValue('schema-value')).toBeTruthy();
  });
});
