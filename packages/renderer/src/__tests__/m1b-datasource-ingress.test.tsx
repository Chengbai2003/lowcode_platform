import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import { SchemaValidationError } from '@lowcode-platform/schema-contract';
import { Renderer } from '../Renderer';
import { renderFromJSON } from '../index';
import * as RuntimeSessionModule from '../session/RuntimeSession';
import { testPreset } from './fixtures/testPreset';

const m1bFixture = JSON.parse(
  readFileSync(
    path.resolve(__dirname, '../../../../test-fixtures/m1b-datasource-conformance.json'),
    'utf8',
  ),
);
const m1aFixture = JSON.parse(
  readFileSync(
    path.resolve(__dirname, '../../../../test-fixtures/m1a-page-logic-conformance.json'),
    'utf8',
  ),
);

class TestErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: unknown }> {
  override state = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  override componentDidCatch() {}
  override render() {
    if (this.state.error) {
      return <div data-testid="error-boundary-caught">{(this.state.error as Error).message}</div>;
    }
    return this.props.children;
  }
}

describe('Renderer Ingress: data-source default-deny (M1b-1 PR A / Refs #64)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('entrance 7: Renderer 挂载（生产清单，无任何屏蔽）', () => {
    it('rejects data-source schema before session creation or any host network call', () => {
      const createSessionSpy = vi.spyOn(RuntimeSessionModule, 'createRuntimeSession');
      const fetchSpy = vi.fn();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = fetchSpy;

      try {
        const errorBoundaryRef = React.createRef<TestErrorBoundary>();
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        try {
          render(
            <TestErrorBoundary ref={errorBoundaryRef}>
              <Renderer
                schema={m1bFixture.schema}
                preset={testPreset}
                pageId="m1b-blocked-renderer"
                documentSessionId="m1b-blocked-doc"
              />
            </TestErrorBoundary>,
          );
        } finally {
          consoleErrorSpy.mockRestore();
        }

        const caughtError = errorBoundaryRef.current?.state.error;
        expect(caughtError).toBeInstanceOf(SchemaValidationError);
        const schemaError = caughtError as SchemaValidationError;
        expect(schemaError.issues.length).toBeGreaterThan(0);
        expect(schemaError.issues.every((i) => i.code === 'CAPABILITY_UNSUPPORTED')).toBe(true);
        expect(schemaError.issues.some((i) => i.message.includes('data-source'))).toBe(true);

        // 副作用断言：未创建 RuntimeSession、未发生任何网络请求
        expect(createSessionSpy).not.toHaveBeenCalled();
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('renderFromJSON rejects data-source schema with the same capability issue', () => {
      let caughtError: unknown;
      try {
        renderFromJSON(JSON.stringify(m1bFixture.schema), {
          preset: testPreset,
          pageId: 'm1b-render-from-json',
          documentSessionId: 'm1b-doc',
        });
      } catch (err) {
        caughtError = err;
      }
      expect(caughtError).toBeInstanceOf(SchemaValidationError);
      const issues = (caughtError as SchemaValidationError).issues;
      expect(issues.some((i) => i.code === 'CAPABILITY_UNSUPPORTED')).toBe(true);
    });

    it('regression: M1a conformance schema still mounts under the production manifest', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        expect(() =>
          render(
            <Renderer
              schema={m1aFixture.schema}
              preset={testPreset}
              pageId="m1b-m1a-regression"
              documentSessionId="m1b-m1a-doc"
            />,
          ),
        ).not.toThrow();
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });
  });
});
