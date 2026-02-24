import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { LowcodeEditor } from '../src/index';

vi.mock('@lowcode-platform/renderer', async () => {
  const actual = await vi.importActual('@lowcode-platform/renderer');
  return {
    ...actual,
    Renderer: () => <div data-testid="mock-renderer">Renderer</div>
  };
});

describe('Editor Package', () => {
  it('should export LowcodeEditor', () => {
    expect(LowcodeEditor).toBeDefined();
    expect(typeof LowcodeEditor).toBe('function');
  });

  // Example basic render test
  // Cannot fully test Monaco in jsdom easily, but we can verify it doesn't immediately throw.
  it('should render LowcodeEditor component wrapper without crashing', () => {
    const { container } = render(<LowcodeEditor />);
    expect(container).toBeDefined();
  });
});
