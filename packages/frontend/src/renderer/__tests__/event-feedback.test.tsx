import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { A2UISchema } from '../../types';
import { LowcodeProvider, Renderer } from '../';

describe('Renderer feedback action', () => {
  it('dispatches message feedback on click', async () => {
    const schema: A2UISchema = {
      rootId: 'root',
      components: {
        root: {
          id: 'root',
          type: 'Button',
          props: {
            children: '触发消息',
          },
          events: {
            onClick: [
              {
                type: 'feedback',
                kind: 'message',
                content: '操作成功',
                level: 'success',
              },
            ],
          },
        },
      },
    };

    const message = {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    };

    render(
      <LowcodeProvider>
        <Renderer schema={schema} eventContext={{ ui: { message } }} />
      </LowcodeProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '触发消息' }));

    await waitFor(() => {
      expect(message.success).toHaveBeenCalledWith('操作成功');
    });
  });
});
