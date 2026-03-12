import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ExpressionEditor } from './ExpressionEditor';

describe('ExpressionEditor', () => {
  it('normalizes plain expression on blur', () => {
    const onChange = vi.fn();
    render(<ExpressionEditor label="表达式" value="" onChange={onChange} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'form.userName' } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith('{{form.userName}}');
  });

  it('shows error for malformed braces and does not emit', () => {
    const onChange = vi.fn();
    render(<ExpressionEditor label="表达式" value="" onChange={onChange} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '{{form.userName' } });
    fireEvent.blur(input);

    expect(
      screen.getByText('表达式格式不合法，请使用 {{ ... }} 或输入纯表达式'),
    ).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
