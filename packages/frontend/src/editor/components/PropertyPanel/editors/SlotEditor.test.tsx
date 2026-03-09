import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SlotEditor } from './SlotEditor';

describe('SlotEditor', () => {
  it('renders fallback text for invalid slot value', () => {
    const onChange = vi.fn();
    render(
      <SlotEditor
        label="插槽"
        value={{ foo: 'bar' }}
        defaultTemplate="默认插槽"
        onChange={onChange}
      />,
    );

    expect(screen.getByDisplayValue('默认插槽')).toBeInTheDocument();
  });

  it('updates slot text and supports reset', () => {
    const onChange = vi.fn();
    render(
      <SlotEditor label="插槽" value="初始内容" defaultTemplate="默认插槽" onChange={onChange} />,
    );

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '新内容' } });
    expect(onChange).toHaveBeenCalledWith('新内容');

    fireEvent.click(screen.getByRole('button', { name: '恢复默认内容' }));
    expect(onChange).toHaveBeenCalledWith('默认插槽');
  });
});
