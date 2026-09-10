import React from 'react';
import {
  createSealedPreset,
  RENDERER_VERSION,
  type ComponentPreset,
} from '@lowcode-platform/renderer';
import type { RuntimeCompatibility } from '@lowcode-platform/schema-contract';

const ButtonA = ({ children, ...props }: React.ComponentProps<'button'>) => (
  <button data-testid="impl-a" {...props}>
    {children}
  </button>
);
ButtonA.displayName = 'ButtonA';

const ButtonB = ({ children, ...props }: React.ComponentProps<'button'>) => (
  <button data-testid="impl-b" {...props}>
    {children}
  </button>
);
ButtonB.displayName = 'ButtonB';

const Page = ({ children, ...props }: React.ComponentProps<'div'>) => (
  <div {...props}>{children}</div>
);

const manifest = {
  Page: { componentType: 'Page', allowedProps: ['children', 'style', 'className', 'id'] },
  Button: { componentType: 'Button', allowedProps: ['children', 'style', 'className', 'id'] },
};

export const abTestPresetA: ComponentPreset = createSealedPreset({
  id: 'test-preset-a',
  version: '1.0.0',
  runtime: { Page, Button: ButtonA },
  manifest,
  compiler: {
    defaultLibrary: 'lib-a',
    componentSources: { Page: 'lib-a/page', Button: 'lib-a/button' },
    allowDefaultComponentFallback: false,
  },
});

export const abTestPresetB: ComponentPreset = createSealedPreset({
  id: 'test-preset-b',
  version: '2.0.0',
  runtime: { Page, Button: ButtonB },
  manifest,
  compiler: {
    defaultLibrary: 'lib-b',
    componentSources: { Page: 'lib-b/page', Button: 'lib-b/button' },
    allowDefaultComponentFallback: false,
  },
});

export const abTestCompatA: RuntimeCompatibility = Object.freeze({
  componentPresetId: abTestPresetA.id,
  componentPresetVersion: abTestPresetA.version,
  rendererVersion: RENDERER_VERSION,
});

export const abTestCompatB: RuntimeCompatibility = Object.freeze({
  componentPresetId: abTestPresetB.id,
  componentPresetVersion: abTestPresetB.version,
  rendererVersion: RENDERER_VERSION,
});
