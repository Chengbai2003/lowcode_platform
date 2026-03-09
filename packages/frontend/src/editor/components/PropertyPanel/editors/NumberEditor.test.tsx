import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NumberEditor } from './NumberEditor';

describe('NumberEditor', () => {
  it('emits number when input is valid', () => {
    const onChange = vi.fn();

    render(<NumberEditor label="数字" value={1} onChange={onChange} />);

    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '42' } });

    expect(onChange).toHaveBeenCalledWith(42);
  });

  it('emits undefined when input cleared', () => {
    const onChange = vi.fn();

    render(<NumberEditor label="数字" value={10} onChange={onChange} />);

    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '' } });

    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
