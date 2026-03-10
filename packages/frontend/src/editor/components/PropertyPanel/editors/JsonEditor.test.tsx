import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { JsonEditor } from './JsonEditor';

describe('JsonEditor', () => {
  it('parses valid json and emits object on blur', () => {
    const onChange = vi.fn();

    render(<JsonEditor label="JSON" value={{ a: 1 }} onChange={onChange} />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, {
      target: { value: '{"name":"alice"}' },
    });
    fireEvent.blur(textarea);

    expect(onChange).toHaveBeenCalledWith({ name: 'alice' });
  });

  it('shows error for invalid json and does not emit', () => {
    const onChange = vi.fn();

    render(<JsonEditor label="JSON" value={{}} onChange={onChange} />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, {
      target: { value: '{invalid-json' },
    });
    fireEvent.blur(textarea);

    expect(screen.getByText('JSON 格式不合法')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('falls back to template when type mismatch', () => {
    const onChange = vi.fn();

    render(
      <JsonEditor label="JSON" value={{}} defaultTemplate={{ span: 6 }} onChange={onChange} />,
    );

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, {
      target: { value: '["wrong-type"]' },
    });
    fireEvent.blur(textarea);

    expect(onChange).toHaveBeenCalledWith({ span: 6 });
    expect(screen.getByText('JSON 类型与默认模板不匹配，已回退默认值')).toBeInTheDocument();
  });

  it('accepts expression string without json parsing', () => {
    const onChange = vi.fn();

    render(<JsonEditor label="JSON" value={{}} onChange={onChange} />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, {
      target: { value: '{{state.dynamicStyle}}' },
    });
    fireEvent.blur(textarea);

    expect(onChange).toHaveBeenCalledWith('{{state.dynamicStyle}}');
    expect(screen.queryByText('JSON 格式不合法')).not.toBeInTheDocument();
  });
});
