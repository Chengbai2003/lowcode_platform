import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { componentRegistry } from '../src/index';

describe('Components Registry', () => {
  it('should register basic Ant Design components', () => {
    expect(componentRegistry).toBeDefined();
    expect(componentRegistry['Button']).toBeDefined();
    expect(componentRegistry['Input']).toBeDefined();
    expect(componentRegistry['Select']).toBeDefined();
  });

  it('renders a registered component without crashing', () => {
    const ButtonComponent = componentRegistry['Button'];
    const { container } = render(<ButtonComponent>Test Button</ButtonComponent>);
    expect(container.textContent).toContain('Test Button');
  });
});
