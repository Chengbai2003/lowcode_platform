import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { A2UISchema } from '../../types';
import { LowcodeProvider, Renderer } from '../';

describe('Renderer visibility', () => {
  it('does not crash when visible toggles to false', () => {
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

    const { rerender } = render(
      <LowcodeProvider>
        <Renderer schema={buildSchema('{{ true }}')} />
      </LowcodeProvider>,
    );

    expect(screen.getByDisplayValue('x')).toBeTruthy();

    expect(() => {
      rerender(
        <LowcodeProvider>
          <Renderer schema={buildSchema('{{ false }}')} />
        </LowcodeProvider>,
      );
    }).not.toThrow();

    expect(screen.queryByDisplayValue('x')).toBeNull();
  });
});
