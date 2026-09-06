import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import * as contract from '@lowcode-platform/schema-contract';
import { SchemaValidationError } from '@lowcode-platform/schema-contract';
import { Renderer } from '../Renderer';
import * as RuntimeSessionModule from '../session/RuntimeSession';
import { testPreset } from './fixtures/testPreset';

const fixtureRaw = readFileSync(
  path.resolve(__dirname, '../../../../test-fixtures/m1a-page-logic-conformance.json'),
  'utf8',
);
const conformanceFixture = JSON.parse(fixtureRaw);

const manifestModulePath = path.resolve(
  __dirname,
  '../../../schema-contract/dist/capabilities/manifest.js',
);
const manifestModule = require(manifestModulePath);

function withBlockedCapability<T>(
  capability: 'page-state' | 'named-computed' | 'action-flow',
  surface: 'contract' | 'validator' | 'editor-agent' | 'renderer' | 'compiler' | 'storage',
  fn: () => T,
): T {
  const original = manifestModule.getTrustedCapabilityManifest;
  manifestModule.getTrustedCapabilityManifest = () => ({
    manifestVersion: 1,
    matrix: contract.createTestCapabilityMatrix({
      [capability]: { [surface]: { status: 'unsupported', revision: 1 } },
    }),
  });
  try {
    return fn();
  } finally {
    manifestModule.getTrustedCapabilityManifest = original;
  }
}

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

describe('Renderer Ingress Capability Gates (C3b / Issue #47)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('7. Renderer 挂载 / 前端预览', () => {
    it('really mounts blocked schema and rejects before session creation, event dispatch, or host network calls', () => {
      const createSessionSpy = vi.spyOn(RuntimeSessionModule, 'createRuntimeSession');
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      const hostCapabilitiesMock = {
        network: {
          fetch: vi.fn(),
          allowedHosts: [],
        },
      };

      const errorBoundaryRef = React.createRef<TestErrorBoundary>();

      withBlockedCapability('page-state', 'renderer', () => {
        // 抑制 React 在 ErrorBoundary 捕获错误时的控制台报错噪声
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        try {
          render(
            <TestErrorBoundary ref={errorBoundaryRef}>
              <Renderer
                schema={conformanceFixture.schema}
                preset={testPreset}
                pageId="test-blocked-renderer-p1"
                documentSessionId="test-blocked-renderer-d1"
                hostCapabilities={hostCapabilitiesMock as never}
              />
            </TestErrorBoundary>,
          );
        } finally {
          consoleErrorSpy.mockRestore();
        }

        // 1. 断言 ErrorBoundary 捕获到具体能力失败（SchemaValidationError），而非通用 React 错误
        const caughtError = errorBoundaryRef.current?.state.error;
        expect(caughtError).toBeDefined();
        expect(caughtError).toBeInstanceOf(SchemaValidationError);

        const schemaError = caughtError as SchemaValidationError;
        expect(schemaError.issues.length).toBeGreaterThan(0);
        expect(schemaError.issues[0].code).toBe('CAPABILITY_UNSUPPORTED');
        expect(schemaError.issues[0].path).toEqual(['logic', 'states']);
        expect(schemaError.issues[0].message).toContain('renderer');

        // 2. 严格副作用断言：拒绝前绝对未创建 Session
        expect(createSessionSpy).not.toHaveBeenCalled();

        // 3. 严格副作用断言：绝对未发生 host 网络调用或全局 fetch
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(hostCapabilitiesMock.network.fetch).not.toHaveBeenCalled();
      });
    });

    it('supported schema mounts normally, creates session, and renders DOM elements', () => {
      const createSessionSpy = vi.spyOn(RuntimeSessionModule, 'createRuntimeSession');

      const { container } = render(
        <Renderer
          schema={conformanceFixture.schema}
          preset={testPreset}
          pageId="test-supported-renderer-p1"
          documentSessionId="test-supported-renderer-d1"
        />,
      );

      // 正常挂载：创建了 Session 并成功渲染 DOM
      expect(createSessionSpy).toHaveBeenCalledTimes(1);
      expect(container.textContent).toContain('change price');
    });

    it('legacy schema without logic mounts normally even when logic capabilities are blocked', () => {
      withBlockedCapability('page-state', 'renderer', () => {
        const { container } = render(
          <Renderer
            schema={conformanceFixture.legacySchema}
            preset={testPreset}
            pageId="test-legacy-renderer-p1"
            documentSessionId="test-legacy-renderer-d1"
          />,
        );

        expect(container.textContent).toContain('Legacy Trigger');
      });
    });
  });
});
