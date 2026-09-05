import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi, beforeAll, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { type PageSchema, analyzeActionFlowDeclarations } from '@lowcode-platform/schema-contract';
import { Renderer } from '../Renderer';
import * as RuntimeSessionModule from '../session/RuntimeSession';
import type { RuntimeSession } from '../session/RuntimeSession';
import { testPreset } from './fixtures/testPreset';
import {
  createGeneratedComponent,
  getCompiledConformanceCodes,
  safeSnapshot,
  type CompilerCapture,
} from './helpers/compilerRunner';

interface Observation {
  checkpoint: string;
  state: Record<string, unknown>;
  computed: Record<string, unknown>;
  visible: Record<string, string>;
  flowResult?: { status: string; flow: string; recovered?: boolean };
  diagnostic?: {
    code: string;
    flow: string;
    step: number | null;
    stepPath: readonly (string | number)[];
    path: readonly (string | number)[];
    trace: readonly { flow: string; step: number | null }[];
  };
}

const fixturePath = path.resolve(
  __dirname,
  '../../../../test-fixtures/m1a-page-logic-conformance.json',
);
const conformanceFixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  schema: PageSchema;
  expected: {
    initial: {
      state: Record<string, unknown>;
      computed: Record<string, unknown>;
    };
    initialVisibleText: {
      status: string;
      computed: string;
      seen: string;
      delayed: string;
    };
    afterChange: {
      state: Record<string, unknown>;
      computed: Record<string, unknown>;
    };
    afterChangeVisibleText: {
      computed: string;
      seen: string;
    };
    afterClick: {
      state: Record<string, unknown>;
    };
    afterClickVisibleText: {
      status: string;
    };
    recovery: {
      state: Record<string, unknown>;
      result: {
        status: string;
        flow: string;
        recovered: boolean;
      };
    };
    unhandledDiagnostic: {
      code: string;
      flow: string;
      step: number;
      stepPath: readonly (string | number)[];
      trace: readonly { flow: string; step: number }[];
    };
    cancellation: {
      flow: string;
      delayMs: number;
      initialState: Record<string, unknown>;
      noWriteBackState: Record<string, unknown>;
    };
  };
  legacySchema: PageSchema;
  legacyExpected: {
    initialVisibleText: string;
    afterClickVisibleText: string;
    afterClickState: {
      legacyKey: string;
    };
  };
  edgeSchema: PageSchema;
  edgeExpected: {
    undefinedKeys: string[];
    values: Record<string, unknown>;
    arraysWithUndefinedItem: string[];
    view: unknown[];
  };
  smallLimits: {
    maxExecutedActions: number;
    maxLoopIterations: number;
    maxFlowDepth: number;
    maxConcurrentRuns: number;
    maxDurationMs: number;
  };
  budgetExceededCases: Record<
    string,
    {
      flow: string;
      schema: PageSchema;
      expectedError: {
        code: string;
        flow: string;
      };
    }
  >;
};

function extractMainVisibleText(container: HTMLElement): Record<string, string> {
  const spans = container.querySelectorAll('span');
  expect(spans).toHaveLength(4);
  return {
    computed: spans[0].textContent ?? '',
    seen: spans[1].textContent ?? '',
    status: spans[2].textContent ?? '',
    delayed: spans[3].textContent ?? '',
  };
}

describe('Renderer–Compiler Observable Parity (C2.3 / Issue #47)', () => {
  let compiledCodes: Record<string, string>;

  beforeAll(() => {
    compiledCodes = getCompiledConformanceCodes();
    expect(compiledCodes.main).toBeDefined();
    expect(compiledCodes.main.length).toBeGreaterThan(0);
  });

  afterEach(() => {
    cleanup();
  });

  describe('P1: 初始挂载 (Initial Mount Parity)', () => {
    it('observes identical initial state, computed, and visible DOM text across Renderer and Compiler', () => {
      const expectedTrace: Observation = {
        checkpoint: 'P1-initial-mount',
        state: safeSnapshot(conformanceFixture.expected.initial.state),
        computed: safeSnapshot(conformanceFixture.expected.initial.computed),
        visible: {
          computed: conformanceFixture.expected.initialVisibleText.computed,
          seen: conformanceFixture.expected.initialVisibleText.seen,
          status: conformanceFixture.expected.initialVisibleText.status,
          delayed: conformanceFixture.expected.initialVisibleText.delayed,
        },
      };

      // 1. Renderer observation
      let activeSession: RuntimeSession | undefined;
      const sessionSpy = vi
        .spyOn(RuntimeSessionModule, 'createRuntimeSession')
        .mockImplementation((options) => {
          const session = new RuntimeSessionModule.RuntimeSession(options);
          activeSession = session;
          return session;
        });

      let rendererTrace: Observation;
      try {
        const rendered = render(
          <Renderer
            preset={testPreset}
            pageId="p1-renderer-page"
            documentSessionId="p1-renderer-session"
            schema={conformanceFixture.schema}
          />,
        );

        expect(activeSession).toBeDefined();
        rendererTrace = {
          checkpoint: 'P1-initial-mount',
          state: safeSnapshot(activeSession!.runtime.getState()),
          computed: safeSnapshot(activeSession!.runtime.getComputed()),
          visible: extractMainVisibleText(rendered.container),
        };
      } finally {
        sessionSpy.mockRestore();
        cleanup();
      }

      // 2. Compiler observation
      let compilerCaps: CompilerCapture | undefined;
      const GeneratedComponent = createGeneratedComponent(compiledCodes.main);

      const rendered = render(
        <GeneratedComponent
          __testCapture={(caps) => {
            compilerCaps = caps;
          }}
        />,
      );

      expect(compilerCaps).toBeDefined();
      const compilerTrace: Observation = {
        checkpoint: 'P1-initial-mount',
        state: safeSnapshot(compilerCaps!.getState()!),
        computed: safeSnapshot(compilerCaps!.getComputed()!),
        visible: extractMainVisibleText(rendered.container),
      };
      cleanup();

      // 3. Three-way comparison
      expect(rendererTrace).toEqual(expectedTrace);
      expect(compilerTrace).toEqual(expectedTrace);
      expect(rendererTrace).toEqual(compilerTrace);
    });
  });

  describe('P2: 同一事件内链式 Computed (Chained Computed within Single Event)', () => {
    it('observes identical chained computed recomputation and DOM updates after click', async () => {
      const expectedTrace: Observation = {
        checkpoint: 'P2-chained-computed',
        state: safeSnapshot(conformanceFixture.expected.afterChange.state),
        computed: safeSnapshot(conformanceFixture.expected.afterChange.computed),
        visible: {
          computed: conformanceFixture.expected.afterChangeVisibleText.computed,
          seen: conformanceFixture.expected.afterChangeVisibleText.seen,
          status: conformanceFixture.expected.initialVisibleText.status,
          delayed: conformanceFixture.expected.initialVisibleText.delayed,
        },
      };

      // 1. Renderer observation
      let activeSession: RuntimeSession | undefined;
      const sessionSpy = vi
        .spyOn(RuntimeSessionModule, 'createRuntimeSession')
        .mockImplementation((options) => {
          const session = new RuntimeSessionModule.RuntimeSession(options);
          activeSession = session;
          return session;
        });

      let rendererTrace: Observation;
      try {
        const rendered = render(
          <Renderer
            preset={testPreset}
            pageId="p2-renderer-page"
            documentSessionId="p2-renderer-session"
            schema={conformanceFixture.schema}
          />,
        );

        expect(activeSession).toBeDefined();

        const changePriceButton = rendered.container.querySelector('button');
        expect(changePriceButton).not.toBeNull();
        expect(changePriceButton!.textContent).toBe('change price');

        await act(async () => {
          fireEvent.click(changePriceButton!);
          await Promise.resolve();
        });

        rendererTrace = {
          checkpoint: 'P2-chained-computed',
          state: safeSnapshot(activeSession!.runtime.getState()),
          computed: safeSnapshot(activeSession!.runtime.getComputed()),
          visible: extractMainVisibleText(rendered.container),
        };
      } finally {
        sessionSpy.mockRestore();
        cleanup();
      }

      // 2. Compiler observation
      let compilerCaps: CompilerCapture | undefined;
      const GeneratedComponent = createGeneratedComponent(compiledCodes.main);

      const rendered = render(
        <GeneratedComponent
          __testCapture={(caps) => {
            compilerCaps = caps;
          }}
        />,
      );

      expect(compilerCaps).toBeDefined();

      const changePriceButton = rendered.container.querySelector('button');
      expect(changePriceButton).not.toBeNull();
      expect(changePriceButton!.textContent).toBe('change price');

      await act(async () => {
        fireEvent.click(changePriceButton!);
        await Promise.resolve();
      });

      const compilerTrace: Observation = {
        checkpoint: 'P2-chained-computed',
        state: safeSnapshot(compilerCaps!.getState()!),
        computed: safeSnapshot(compilerCaps!.getComputed()!),
        visible: extractMainVisibleText(rendered.container),
      };
      cleanup();

      // 3. Three-way comparison
      expect(rendererTrace).toEqual(expectedTrace);
      expect(compilerTrace).toEqual(expectedTrace);
      expect(rendererTrace).toEqual(compilerTrace);
    });
  });

  describe('P3: 嵌套 Flow 成功 (Nested Flow Success)', () => {
    it('observes nested flow execution with input propagation and DOM update', async () => {
      const expectedTrace: Observation = {
        checkpoint: 'P3-nested-flow-success',
        state: safeSnapshot({
          ...conformanceFixture.expected.initial.state,
          ...conformanceFixture.expected.afterClick.state,
        }),
        computed: safeSnapshot(conformanceFixture.expected.initial.computed),
        visible: {
          computed: conformanceFixture.expected.initialVisibleText.computed,
          seen: conformanceFixture.expected.initialVisibleText.seen,
          status: conformanceFixture.expected.afterClickVisibleText.status,
          delayed: conformanceFixture.expected.initialVisibleText.delayed,
        },
        flowResult: {
          status: 'success',
          flow: 'submitOrder',
          recovered: false,
        },
      };

      // 1. Renderer observation
      let activeSession: RuntimeSession | undefined;
      const sessionSpy = vi
        .spyOn(RuntimeSessionModule, 'createRuntimeSession')
        .mockImplementation((options) => {
          const session = new RuntimeSessionModule.RuntimeSession(options);
          activeSession = session;
          return session;
        });

      let rendererTrace: Observation;
      try {
        const rendered = render(
          <Renderer
            preset={testPreset}
            pageId="p3-renderer-page"
            documentSessionId="p3-renderer-session"
            schema={conformanceFixture.schema}
          />,
        );

        expect(activeSession).toBeDefined();
        const executeFlowSpy = vi.spyOn(activeSession!, 'executeFlow');

        const submitButton = Array.from(rendered.container.querySelectorAll('button')).find(
          (btn) => btn.textContent === 'Submit',
        );
        expect(submitButton).toBeDefined();

        let flowResult: unknown;
        await act(async () => {
          fireEvent.click(submitButton!);
          flowResult = await executeFlowSpy.mock.results[0].value;
        });

        expect(executeFlowSpy).toHaveBeenCalledWith('submitOrder', { source: 'fixture' });

        rendererTrace = {
          checkpoint: 'P3-nested-flow-success',
          state: safeSnapshot(activeSession!.runtime.getState()),
          computed: safeSnapshot(activeSession!.runtime.getComputed()),
          visible: extractMainVisibleText(rendered.container),
          flowResult: safeSnapshot(flowResult as Observation['flowResult']),
        };
      } finally {
        sessionSpy.mockRestore();
        cleanup();
      }

      // 2. Compiler observation
      let compilerCaps: CompilerCapture | undefined;
      const GeneratedComponent = createGeneratedComponent(compiledCodes.main);

      const rendered = render(
        <GeneratedComponent
          __testCapture={(caps) => {
            compilerCaps = caps;
          }}
        />,
      );

      expect(compilerCaps).toBeDefined();
      const submitButton = Array.from(rendered.container.querySelectorAll('button')).find(
        (btn) => btn.textContent === 'Submit',
      );
      expect(submitButton).toBeDefined();

      await act(async () => {
        fireEvent.click(submitButton!);
        await Promise.resolve();
      });

      // Execute on fresh instance to isolate engine flow return value
      let freshCaps: CompilerCapture | undefined;
      render(
        <GeneratedComponent
          __testCapture={(caps) => {
            freshCaps = caps;
          }}
        />,
      );
      let compilerFlowResult: unknown;
      await act(async () => {
        compilerFlowResult = await freshCaps!.executeFlow!('submitOrder', {
          source: 'fixture',
        });
      });

      const compilerTrace: Observation = {
        checkpoint: 'P3-nested-flow-success',
        state: safeSnapshot(compilerCaps!.getState()!),
        computed: safeSnapshot(compilerCaps!.getComputed()!),
        visible: extractMainVisibleText(rendered.container),
        flowResult: safeSnapshot(compilerFlowResult as Observation['flowResult']),
      };
      cleanup();

      // 3. Three-way comparison
      expect(rendererTrace).toEqual(expectedTrace);
      expect(compilerTrace).toEqual(expectedTrace);
      expect(rendererTrace).toEqual(compilerTrace);
    });
  });

  describe('P4: onError 恢复 (Recovery from Error)', () => {
    it('observes onError recovery when apiCall fails with /fail', async () => {
      const expectedTrace: Observation = {
        checkpoint: 'P4-error-recovery',
        state: safeSnapshot({
          ...conformanceFixture.expected.initial.state,
          ...conformanceFixture.expected.recovery.state,
        }),
        computed: safeSnapshot(conformanceFixture.expected.initial.computed),
        visible: {
          computed: conformanceFixture.expected.initialVisibleText.computed,
          seen: conformanceFixture.expected.initialVisibleText.seen,
          status: conformanceFixture.expected.initialVisibleText.status,
          delayed: conformanceFixture.expected.initialVisibleText.delayed,
        },
        flowResult: safeSnapshot(conformanceFixture.expected.recovery.result),
      };

      // 1. Renderer observation
      let activeSession: RuntimeSession | undefined;
      const apiGetMock = vi.fn().mockRejectedValue(new Error('Network error at /fail'));
      const sessionSpy = vi
        .spyOn(RuntimeSessionModule, 'createRuntimeSession')
        .mockImplementation((options) => {
          const session = new RuntimeSessionModule.RuntimeSession(options);
          activeSession = session;
          return session;
        });

      let rendererTrace: Observation;
      try {
        const rendered = render(
          <Renderer
            preset={testPreset}
            pageId="p4-renderer-page"
            documentSessionId="p4-renderer-session"
            schema={conformanceFixture.schema}
            eventContext={{ api: { get: apiGetMock } }}
          />,
        );

        expect(activeSession).toBeDefined();
        let result: unknown;
        await act(async () => {
          result = await activeSession!.executeFlow('recoverFailure');
        });

        expect(apiGetMock).toHaveBeenCalledTimes(1);
        expect(apiGetMock.mock.calls[0][0]).toContain('/fail');

        const toFlowResult = (res: unknown) => {
          const r = res as
            | { status?: unknown; flow?: unknown; recovered?: unknown }
            | null
            | undefined;
          return r
            ? {
                status: r.status,
                flow: r.flow,
                recovered: r.recovered,
              }
            : undefined;
        };

        rendererTrace = {
          checkpoint: 'P4-error-recovery',
          state: safeSnapshot(activeSession!.runtime.getState()),
          computed: safeSnapshot(activeSession!.runtime.getComputed()),
          visible: extractMainVisibleText(rendered.container),
          flowResult: toFlowResult(result),
        };
      } finally {
        sessionSpy.mockRestore();
        cleanup();
      }

      // 2. Compiler observation
      const originalFetch = globalThis.fetch;
      const compilerFetchMock = vi.fn().mockRejectedValue(new Error('Network error at /fail'));
      globalThis.fetch = compilerFetchMock as unknown as typeof fetch;

      let compilerCaps: CompilerCapture | undefined;
      let compilerTrace: Observation;
      try {
        const GeneratedComponent = createGeneratedComponent(compiledCodes.main);
        const rendered = render(
          <GeneratedComponent
            __testCapture={(caps) => {
              compilerCaps = caps;
            }}
          />,
        );

        expect(compilerCaps).toBeDefined();
        let result: unknown;
        await act(async () => {
          result = await compilerCaps!.executeFlow!('recoverFailure');
        });

        expect(compilerFetchMock).toHaveBeenCalledTimes(1);
        expect(compilerFetchMock.mock.calls[0][0]).toContain('/fail');

        const toFlowResult = (res: unknown) => {
          const r = res as
            | { status?: unknown; flow?: unknown; recovered?: unknown }
            | null
            | undefined;
          return r
            ? {
                status: r.status,
                flow: r.flow,
                recovered: r.recovered,
              }
            : undefined;
        };

        compilerTrace = {
          checkpoint: 'P4-error-recovery',
          state: safeSnapshot(compilerCaps!.getState()!),
          computed: safeSnapshot(compilerCaps!.getComputed()!),
          visible: extractMainVisibleText(rendered.container),
          flowResult: toFlowResult(result),
        };
      } finally {
        globalThis.fetch = originalFetch;
        cleanup();
      }

      // 3. Three-way comparison
      expect(rendererTrace).toEqual(expectedTrace);
      expect(compilerTrace).toEqual(expectedTrace);
      expect(rendererTrace).toEqual(compilerTrace);
    });
  });

  describe('P5: 未处理失败 (Unhandled Failure Diagnostic Parity)', () => {
    it('observes rejection with structural diagnostic and unchanged state when unhandledFailure occurs', async () => {
      const expectedDiagnostic = {
        code: conformanceFixture.expected.unhandledDiagnostic.code,
        flow: conformanceFixture.expected.unhandledDiagnostic.flow,
        step: conformanceFixture.expected.unhandledDiagnostic.step,
        stepPath: conformanceFixture.expected.unhandledDiagnostic.stepPath,
        path: ['logic', 'flows', 'unhandledFailure', 'steps', 0],
        trace: conformanceFixture.expected.unhandledDiagnostic.trace,
      };

      // 1. Renderer observation
      let activeSession: RuntimeSession | undefined;
      const apiGetMock = vi.fn().mockRejectedValue(new Error('Network error at /fail'));
      const sessionSpy = vi
        .spyOn(RuntimeSessionModule, 'createRuntimeSession')
        .mockImplementation((options) => {
          const session = new RuntimeSessionModule.RuntimeSession(options);
          activeSession = session;
          return session;
        });

      let rendererDiagnostic: unknown;
      let rendererTrace: Observation;
      try {
        const rendered = render(
          <Renderer
            preset={testPreset}
            pageId="p5-renderer-page"
            documentSessionId="p5-renderer-session"
            schema={conformanceFixture.schema}
            eventContext={{ api: { get: apiGetMock } }}
          />,
        );

        expect(activeSession).toBeDefined();
        try {
          await activeSession!.executeFlow('unhandledFailure');
          expect.fail('Expected executeFlow to reject');
        } catch (err) {
          const e = err as { diagnostic?: unknown } | null | undefined;
          rendererDiagnostic = safeSnapshot(e?.diagnostic ?? err);
        }

        rendererTrace = {
          checkpoint: 'P5-unhandled-failure',
          state: safeSnapshot(activeSession!.runtime.getState()),
          computed: safeSnapshot(activeSession!.runtime.getComputed()),
          visible: extractMainVisibleText(rendered.container),
          diagnostic: rendererDiagnostic as Observation['diagnostic'],
        };
      } finally {
        sessionSpy.mockRestore();
        cleanup();
      }

      // 2. Compiler observation
      const originalFetch = globalThis.fetch;
      const compilerFetchMock = vi.fn().mockRejectedValue(new Error('Network error at /fail'));
      globalThis.fetch = compilerFetchMock as unknown as typeof fetch;

      let compilerCaps: CompilerCapture | undefined;
      let compilerDiagnostic: unknown;
      let compilerTrace: Observation;
      try {
        const GeneratedComponent = createGeneratedComponent(compiledCodes.main);
        const rendered = render(
          <GeneratedComponent
            __testCapture={(caps) => {
              compilerCaps = caps;
            }}
          />,
        );

        expect(compilerCaps).toBeDefined();
        try {
          await compilerCaps!.executeFlow!('unhandledFailure');
          expect.fail('Expected compiler executeFlow to reject');
        } catch (err) {
          const e = err as { diagnostic?: unknown } | null | undefined;
          compilerDiagnostic = safeSnapshot(e?.diagnostic ?? err);
        }

        compilerTrace = {
          checkpoint: 'P5-unhandled-failure',
          state: safeSnapshot(compilerCaps!.getState()!),
          computed: safeSnapshot(compilerCaps!.getComputed()!),
          visible: extractMainVisibleText(rendered.container),
          diagnostic: compilerDiagnostic as Observation['diagnostic'],
        };
      } finally {
        globalThis.fetch = originalFetch;
        cleanup();
      }

      const toStructuralDiagnostic = (d: Observation['diagnostic']) => ({
        code: d?.code,
        flow: d?.flow,
        step: d?.step,
        stepPath: d?.stepPath,
        path: d?.path,
        trace: d?.trace,
      });

      // 3. Comparison
      expect(toStructuralDiagnostic(rendererTrace.diagnostic)).toEqual(expectedDiagnostic);
      expect(toStructuralDiagnostic(compilerTrace.diagnostic)).toEqual(expectedDiagnostic);
      expect(rendererTrace.state).toEqual(conformanceFixture.expected.initial.state);
      expect(compilerTrace.state).toEqual(conformanceFixture.expected.initial.state);
      expect(rendererTrace.computed).toEqual(conformanceFixture.expected.initial.computed);
      expect(compilerTrace.computed).toEqual(conformanceFixture.expected.initial.computed);
      expect(toStructuralDiagnostic(rendererTrace.diagnostic)).toEqual(
        toStructuralDiagnostic(compilerTrace.diagnostic),
      );
    });
  });

  describe('P6: 延迟取消和旧实例写回阻断 (Delay Cancellation Parity)', () => {
    it('observes delay abort on unmount and blocks late write-back across both engines', async () => {
      vi.useFakeTimers();

      try {
        const cancellation = conformanceFixture.expected.cancellation;

        // 1. Renderer observation
        let activeSession: RuntimeSession | undefined;
        let executeFlowSpy: ReturnType<typeof vi.spyOn> | undefined;
        const sessionSpy = vi
          .spyOn(RuntimeSessionModule, 'createRuntimeSession')
          .mockImplementation((options) => {
            const session = new RuntimeSessionModule.RuntimeSession(options);
            activeSession = session;
            return session;
          });

        let rendererOldStateBefore: unknown;
        let rendererOldStateAfter: unknown;
        let rendererRejectedCode: string | undefined;

        try {
          const rendered = render(
            <Renderer
              preset={testPreset}
              pageId="p6-renderer-page"
              documentSessionId="p6-renderer-session"
              schema={conformanceFixture.schema}
            />,
          );

          expect(activeSession).toBeDefined();
          executeFlowSpy = vi.spyOn(activeSession!, 'executeFlow');

          const cancelBtn = Array.from(rendered.container.querySelectorAll('button')).find(
            (btn) => btn.textContent === 'Cancel Delay',
          );
          expect(cancelBtn).toBeDefined();

          // Click Cancel Delay
          await act(async () => {
            fireEvent.click(cancelBtn!);
            await vi.advanceTimersByTimeAsync(Math.floor(cancellation.delayMs / 2));
          });

          expect(executeFlowSpy).toHaveBeenCalledTimes(1);
          const flowPromise = executeFlowSpy.mock.results[0].value as Promise<unknown>;
          flowPromise.catch(() => {}); // prevent unhandled rejection

          rendererOldStateBefore = safeSnapshot(activeSession!.runtime.getState().delayedState);
          expect(rendererOldStateBefore).toBe('initial');

          // Unmount component while delay is pending
          rendered.unmount();
          expect(activeSession!.isDisposed()).toBe(true);

          try {
            await flowPromise;
          } catch (err) {
            const e = err as { diagnostic?: { code?: string }; code?: string } | null | undefined;
            rendererRejectedCode = e?.diagnostic?.code ?? e?.code;
          }

          // Advance past full delay
          await act(async () => {
            await vi.advanceTimersByTimeAsync(cancellation.delayMs * 2);
          });

          // Check SAME session instance: must not have written late_finish
          rendererOldStateAfter = safeSnapshot(activeSession!.runtime.getState().delayedState);
          expect(rendererOldStateAfter).toBe(cancellation.noWriteBackState.delayedState);
        } finally {
          executeFlowSpy?.mockRestore();
          sessionSpy.mockRestore();
          cleanup();
        }

        // 2. Compiler observation
        let compilerCaps: CompilerCapture | undefined;
        let compilerOldStateBefore: unknown;
        let compilerOldStateAfter: unknown;
        let compilerRejectedCode: string | undefined;

        try {
          let capturedFlowPromise: Promise<unknown> | undefined;
          const compilerFlowSpy = vi.fn((_flowName, _input, next) => {
            const p = next();
            capturedFlowPromise = p;
            p.catch(() => {}); // prevent unhandled rejection
            return p;
          });

          const GeneratedComponent = createGeneratedComponent(compiledCodes.main);
          const rendered = render(
            <GeneratedComponent
              __testCapture={(caps) => {
                compilerCaps = caps;
              }}
              __onExecuteFlow={compilerFlowSpy}
            />,
          );

          expect(compilerCaps).toBeDefined();
          const capturedInstance = compilerCaps!;

          const cancelBtn = Array.from(rendered.container.querySelectorAll('button')).find(
            (btn) => btn.textContent === 'Cancel Delay',
          );
          expect(cancelBtn).toBeDefined();

          // Click Cancel Delay button (same interaction as Renderer)
          await act(async () => {
            fireEvent.click(cancelBtn!);
            await vi.advanceTimersByTimeAsync(Math.floor(cancellation.delayMs / 2));
          });

          expect(compilerFlowSpy).toHaveBeenCalledTimes(1);
          expect(compilerFlowSpy.mock.calls[0][0]).toBe('cancelDelayFlow');
          expect(capturedFlowPromise).toBeDefined();

          compilerOldStateBefore = safeSnapshot(capturedInstance.getState()?.delayedState);
          expect(compilerOldStateBefore).toBe('initial');

          // Unmount component while delay is pending
          rendered.unmount();

          try {
            await capturedFlowPromise;
          } catch (err) {
            const e = err as { diagnostic?: { code?: string }; code?: string } | null | undefined;
            compilerRejectedCode = e?.diagnostic?.code ?? e?.code;
          }

          // Advance past full delay
          await act(async () => {
            await vi.advanceTimersByTimeAsync(cancellation.delayMs * 2);
          });

          // Check SAME unmounted instance: must not have written late_finish
          compilerOldStateAfter = safeSnapshot(capturedInstance.getState()?.delayedState);
          expect(compilerOldStateAfter).toBe(cancellation.noWriteBackState.delayedState);
        } finally {
          cleanup();
        }

        // 3. Parity assertions
        expect(rendererRejectedCode).toBe('FLOW_ABORTED');
        expect(compilerRejectedCode).toBe('FLOW_ABORTED');
        expect(rendererOldStateBefore).toEqual(compilerOldStateBefore);
        expect(rendererOldStateAfter).toEqual(compilerOldStateAfter);

        // Mount new fresh instances of both engines and assert clean full initial state
        let freshRendererSession: RuntimeSession | undefined;
        const freshSessionSpy = vi
          .spyOn(RuntimeSessionModule, 'createRuntimeSession')
          .mockImplementation((options) => {
            const session = new RuntimeSessionModule.RuntimeSession(options);
            freshRendererSession = session;
            return session;
          });

        let freshCompilerCaps: CompilerCapture | undefined;
        try {
          const freshRendered = render(
            <Renderer
              preset={testPreset}
              pageId="p6-fresh-renderer"
              documentSessionId="p6-fresh-session"
              schema={conformanceFixture.schema}
            />,
          );
          expect(freshRendererSession).toBeDefined();
          expect(freshRendererSession!.runtime.getState()).toEqual(
            conformanceFixture.expected.initial.state,
          );
          expect(freshRendererSession!.runtime.getComputed()).toEqual(
            conformanceFixture.expected.initial.computed,
          );
          expect(extractMainVisibleText(freshRendered.container)).toEqual(
            conformanceFixture.expected.initialVisibleText,
          );
          freshRendered.unmount();

          const GeneratedComponent = createGeneratedComponent(compiledCodes.main);
          const freshCompilerRendered = render(
            <GeneratedComponent
              __testCapture={(caps) => {
                freshCompilerCaps = caps;
              }}
            />,
          );
          expect(freshCompilerCaps).toBeDefined();
          expect(freshCompilerCaps!.getState()).toEqual(conformanceFixture.expected.initial.state);
          expect(freshCompilerCaps!.getComputed()).toEqual(
            conformanceFixture.expected.initial.computed,
          );
          expect(extractMainVisibleText(freshCompilerRendered.container)).toEqual(
            conformanceFixture.expected.initialVisibleText,
          );
          freshCompilerRendered.unmount();
        } finally {
          freshSessionSpy.mockRestore();
          cleanup();
        }
      } finally {
        cleanup();
        vi.useRealTimers();
      }
    });
  });

  describe('P7: 双实例隔离 (Dual Instance Isolation)', () => {
    it('observes strict isolation between two mounted instances of the same schema', async () => {
      const pristineSchema = JSON.parse(JSON.stringify(conformanceFixture.schema));
      const expectedBStateAfterSubmit = {
        ...conformanceFixture.expected.initial.state,
        source: 'fixture',
        count: 1,
      };

      // 1. Renderer observation
      const sessionMap = new Map<string, RuntimeSession>();
      const sessionSpy = vi
        .spyOn(RuntimeSessionModule, 'createRuntimeSession')
        .mockImplementation((options) => {
          const session = new RuntimeSessionModule.RuntimeSession(options);
          sessionMap.set(options.documentSessionId, session);
          return session;
        });

      try {
        const containerA = document.createElement('div');
        const containerB = document.createElement('div');
        document.body.appendChild(containerA);
        document.body.appendChild(containerB);

        const renderedA = render(
          <Renderer
            preset={testPreset}
            pageId="p7-page-a"
            documentSessionId="p7-session-a"
            schema={conformanceFixture.schema}
          />,
          { container: containerA },
        );

        const renderedB = render(
          <Renderer
            preset={testPreset}
            pageId="p7-page-b"
            documentSessionId="p7-session-b"
            schema={conformanceFixture.schema}
          />,
          { container: containerB },
        );

        const sessionA = sessionMap.get('p7-session-a')!;
        const sessionB = sessionMap.get('p7-session-b')!;
        expect(sessionA).toBeDefined();
        expect(sessionB).toBeDefined();

        // Click change price only in containerA
        const btnChangeA = containerA.querySelector('button');
        expect(btnChangeA?.textContent).toBe('change price');

        await act(async () => {
          fireEvent.click(btnChangeA!);
          await Promise.resolve();
        });

        // Verify A is afterChange, B is initial (full state and full computed)
        expect(sessionA.runtime.getState()).toEqual(conformanceFixture.expected.afterChange.state);
        expect(sessionA.runtime.getComputed()).toEqual(
          conformanceFixture.expected.afterChange.computed,
        );
        expect(sessionB.runtime.getState()).toEqual(conformanceFixture.expected.initial.state);
        expect(sessionB.runtime.getComputed()).toEqual(
          conformanceFixture.expected.initial.computed,
        );
        expect(extractMainVisibleText(containerA).computed).toBe('19');
        expect(extractMainVisibleText(containerB).computed).toBe('10');

        // Unmount A, verify B is unaffected and can submit
        renderedA.unmount();
        expect(sessionA.isDisposed()).toBe(true);

        const btnSubmitB = Array.from(containerB.querySelectorAll('button')).find(
          (b) => b.textContent === 'Submit',
        );
        expect(btnSubmitB).toBeDefined();

        await act(async () => {
          fireEvent.click(btnSubmitB!);
          await Promise.resolve();
        });

        // Verify B's full state after submit
        expect(sessionB.runtime.getState()).toEqual(expectedBStateAfterSubmit);
        expect(sessionB.runtime.getComputed()).toEqual(
          conformanceFixture.expected.initial.computed,
        );
        expect(extractMainVisibleText(containerB).status).toBe('fixture:1');

        renderedB.unmount();
        containerA.remove();
        containerB.remove();
      } finally {
        sessionSpy.mockRestore();
        cleanup();
      }

      // 2. Compiler observation
      const GeneratedComponent = createGeneratedComponent(compiledCodes.main);
      let capsA: CompilerCapture | undefined;
      let capsB: CompilerCapture | undefined;

      const containerA = document.createElement('div');
      const containerB = document.createElement('div');
      document.body.appendChild(containerA);
      document.body.appendChild(containerB);

      try {
        const renderedA = render(
          <GeneratedComponent
            __testCapture={(caps) => {
              capsA = caps;
            }}
          />,
          { container: containerA },
        );

        const renderedB = render(
          <GeneratedComponent
            __testCapture={(caps) => {
              capsB = caps;
            }}
          />,
          { container: containerB },
        );

        expect(capsA).toBeDefined();
        expect(capsB).toBeDefined();

        const btnChangeA = containerA.querySelector('button');
        expect(btnChangeA?.textContent).toBe('change price');

        await act(async () => {
          fireEvent.click(btnChangeA!);
          await Promise.resolve();
        });

        // Verify A is afterChange, B is initial (full state and full computed)
        expect(capsA!.getState()).toEqual(conformanceFixture.expected.afterChange.state);
        expect(capsA!.getComputed()).toEqual(conformanceFixture.expected.afterChange.computed);
        expect(capsB!.getState()).toEqual(conformanceFixture.expected.initial.state);
        expect(capsB!.getComputed()).toEqual(conformanceFixture.expected.initial.computed);
        expect(extractMainVisibleText(containerA).computed).toBe('19');
        expect(extractMainVisibleText(containerB).computed).toBe('10');

        renderedA.unmount();

        const btnSubmitB = Array.from(containerB.querySelectorAll('button')).find(
          (b) => b.textContent === 'Submit',
        );
        expect(btnSubmitB).toBeDefined();

        await act(async () => {
          fireEvent.click(btnSubmitB!);
          await Promise.resolve();
        });

        // Verify B's full state after submit
        expect(capsB!.getState()).toEqual(expectedBStateAfterSubmit);
        expect(capsB!.getComputed()).toEqual(conformanceFixture.expected.initial.computed);
        expect(extractMainVisibleText(containerB).status).toBe('fixture:1');

        renderedB.unmount();
      } finally {
        containerA.remove();
        containerB.remove();
        cleanup();
      }

      // 3. Schema immutability assertion
      expect(conformanceFixture.schema).toEqual(pristineSchema);
    });
  });

  describe('P8: Legacy 无 logic (Legacy Schema without Logic)', () => {
    it('observes legacy schema execution parity with inline ActionList and data bindings', async () => {
      expect(conformanceFixture.legacySchema.logic).toBeUndefined();

      // 1. Renderer observation
      let activeSession: RuntimeSession | undefined;
      const sessionSpy = vi
        .spyOn(RuntimeSessionModule, 'createRuntimeSession')
        .mockImplementation((options) => {
          const session = new RuntimeSessionModule.RuntimeSession(options);
          activeSession = session;
          return session;
        });

      let rendererVisibleInitial = '';
      let rendererVisibleAfterClick = '';
      let rendererDataAfterClick: unknown;

      try {
        const rendered = render(
          <Renderer
            preset={testPreset}
            pageId="p8-renderer-legacy-page"
            documentSessionId="p8-renderer-legacy-session"
            schema={conformanceFixture.legacySchema}
          />,
        );

        expect(activeSession).toBeDefined();
        const textElement = rendered.container.querySelector('span');
        rendererVisibleInitial = textElement?.textContent ?? '';

        const triggerButton = Array.from(rendered.container.querySelectorAll('button')).find(
          (btn) => btn.textContent === 'Legacy Trigger',
        );
        expect(triggerButton).toBeDefined();

        await act(async () => {
          fireEvent.click(triggerButton!);
          await Promise.resolve();
        });

        rendererVisibleAfterClick = textElement?.textContent ?? '';
        rendererDataAfterClick = activeSession!.runtime.get('data.legacyKey');
      } finally {
        sessionSpy.mockRestore();
        cleanup();
      }

      // 2. Compiler observation
      let compilerCaps: CompilerCapture | undefined;
      const GeneratedComponent = createGeneratedComponent(compiledCodes.legacy);

      let compilerVisibleInitial = '';
      let compilerVisibleAfterClick = '';
      let compilerDataAfterClick: unknown;

      try {
        const rendered = render(
          <GeneratedComponent
            __testCapture={(caps) => {
              compilerCaps = caps;
            }}
          />,
        );

        expect(compilerCaps).toBeDefined();
        const textElement = rendered.container.querySelector('span');
        compilerVisibleInitial = textElement?.textContent ?? '';

        const triggerButton = Array.from(rendered.container.querySelectorAll('button')).find(
          (btn) => btn.textContent === 'Legacy Trigger',
        );
        expect(triggerButton).toBeDefined();

        await act(async () => {
          fireEvent.click(triggerButton!);
          await Promise.resolve();
        });

        compilerVisibleAfterClick = textElement?.textContent ?? '';
        compilerDataAfterClick = compilerCaps!.getData?.()?.legacyKey;
      } finally {
        cleanup();
      }

      // 3. Parity checks against expected
      expect(rendererVisibleInitial).toBe(conformanceFixture.legacyExpected.initialVisibleText);
      expect(compilerVisibleInitial).toBe(conformanceFixture.legacyExpected.initialVisibleText);
      expect(rendererVisibleAfterClick).toBe(
        conformanceFixture.legacyExpected.afterClickVisibleText,
      );
      expect(compilerVisibleAfterClick).toBe(
        conformanceFixture.legacyExpected.afterClickVisibleText,
      );
      expect(rendererDataAfterClick).toBe(
        conformanceFixture.legacyExpected.afterClickState.legacyKey,
      );
      expect(compilerDataAfterClick).toBe(
        conformanceFixture.legacyExpected.afterClickState.legacyKey,
      );
      expect(conformanceFixture.legacySchema.logic).toBeUndefined();
    });
  });

  describe('P9: Computed edge 语义 (Edge Cases in Computed Logic)', () => {
    it('observes strict parity across undefinedKeys, values, nullableView, and immutable view', async () => {
      // 1. Renderer observation
      let activeSession: RuntimeSession | undefined;
      const sessionSpy = vi
        .spyOn(RuntimeSessionModule, 'createRuntimeSession')
        .mockImplementation((options) => {
          const session = new RuntimeSessionModule.RuntimeSession(options);
          activeSession = session;
          return session;
        });

      let rendererComputed: Record<string, unknown> = {};
      let rendererState: Record<string, unknown> = {};

      try {
        render(
          <Renderer
            preset={testPreset}
            pageId="p9-renderer-edge-page"
            documentSessionId="p9-renderer-edge-session"
            schema={conformanceFixture.edgeSchema}
          />,
        );

        expect(activeSession).toBeDefined();
        rendererComputed = activeSession!.runtime.getComputed() as Record<string, unknown>;
        rendererState = activeSession!.runtime.getState();
      } finally {
        sessionSpy.mockRestore();
        cleanup();
      }

      // 2. Compiler observation
      let compilerCaps: CompilerCapture | undefined;
      const GeneratedComponent = createGeneratedComponent(compiledCodes.edge);

      try {
        render(
          <GeneratedComponent
            __testCapture={(caps) => {
              compilerCaps = caps;
            }}
          />,
        );

        expect(compilerCaps).toBeDefined();
      } finally {
        cleanup();
      }

      const compilerComputed = compilerCaps!.getComputed() as Record<string, unknown>;
      const compilerState = compilerCaps!.getState() as Record<string, unknown>;

      // 3. Parity checks against edgeExpected
      // 3.1 undefinedKeys: undefined items must be explicitly checked (not masked by JSON serialization)
      for (const key of conformanceFixture.edgeExpected.undefinedKeys) {
        expect(key in rendererComputed).toBe(true);
        expect(key in compilerComputed).toBe(true);
        expect(rendererComputed[key]).toBeUndefined();
        expect(compilerComputed[key]).toBeUndefined();
      }

      // 3.2 values
      for (const [key, expectedVal] of Object.entries(conformanceFixture.edgeExpected.values)) {
        expect(rendererComputed[key]).toEqual(expectedVal);
        expect(compilerComputed[key]).toEqual(expectedVal);
      }

      // 3.3 arraysWithUndefinedItem
      for (const key of conformanceFixture.edgeExpected.arraysWithUndefinedItem) {
        expect(Array.isArray(rendererComputed[key])).toBe(true);
        expect(Array.isArray(compilerComputed[key])).toBe(true);
        const rendererArr = rendererComputed[key] as unknown[];
        const compilerArr = compilerComputed[key] as unknown[];
        expect(rendererArr).toHaveLength(1);
        expect(compilerArr).toHaveLength(1);
        expect(rendererArr[0]).toBeUndefined();
        expect(compilerArr[0]).toBeUndefined();
      }

      // 3.4 view immutability and independence from state.profile
      expect(rendererComputed.view).toEqual(conformanceFixture.edgeExpected.view);
      expect(compilerComputed.view).toEqual(conformanceFixture.edgeExpected.view);
      expect(rendererComputed.view).not.toBe(rendererState.profile);
      expect(compilerComputed.view).not.toBe(compilerState.profile);
      expect(Object.isFrozen(rendererComputed.view)).toBe(true);
      expect(Object.isFrozen(compilerComputed.view)).toBe(true);
      expect(Object.isFrozen((rendererComputed.view as unknown[])[0])).toBe(true);
      expect(Object.isFrozen((compilerComputed.view as unknown[])[0])).toBe(true);

      // 3.5 Full computed graph comparison
      for (const key of Object.keys(conformanceFixture.edgeSchema.logic?.computed ?? {})) {
        expect(rendererComputed[key]).toEqual(compilerComputed[key]);
      }
    });
  });

  describe('P10: 五个宿主预算 case (Host Budget Cases Parity)', () => {
    const budgetTypes = [
      'actionBudget',
      'iterationBudget',
      'depthBudget',
      'durationBudget',
      'concurrencyBudget',
    ] as const;

    for (const budgetType of budgetTypes) {
      it(`enforces budget failure parity for ${budgetType}`, async () => {
        const caseConfig = conformanceFixture.budgetExceededCases[budgetType];
        expect(caseConfig).toBeDefined();

        // 1. RuntimeSession observation
        const analysis = analyzeActionFlowDeclarations(caseConfig.schema.logic!.flows!);
        expect(analysis.ok).toBe(true);

        const session = RuntimeSessionModule.createRuntimeSession({
          pageId: `p10-${budgetType}-session`,
          documentSessionId: `p10-doc-${budgetType}`,
          dispatcherInit: {
            state: caseConfig.schema.logic?.states ? { ...caseConfig.schema.logic.states } : {},
          },
          flowAnalysis: analysis.value!,
          flowExecutionLimits: conformanceFixture.smallLimits,
        });

        let rendererError: unknown;
        if (budgetType === 'concurrencyBudget') {
          const p1 = session.executeFlow(caseConfig.flow);
          const p2 = session.executeFlow(caseConfig.flow);
          try {
            await p2;
          } catch (err) {
            rendererError = err;
          }
          // Cleanup p1
          session.dispose();
          try {
            await p1;
          } catch {
            // expected p1 aborted
          }
        } else if (budgetType === 'durationBudget') {
          vi.useFakeTimers();
          try {
            const flowPromise = session.executeFlow(caseConfig.flow);
            flowPromise.catch(() => {});
            await vi.advanceTimersByTimeAsync(100);
            try {
              await flowPromise;
            } catch (err) {
              rendererError = err;
            }
          } finally {
            session.dispose();
            vi.useRealTimers();
          }
        } else {
          try {
            await session.executeFlow(caseConfig.flow);
          } catch (err) {
            rendererError = err;
          } finally {
            session.dispose();
          }
        }

        const extractDiagnostic = (err: unknown) => {
          const e = err as { diagnostic?: unknown } | null | undefined;
          const d = (e?.diagnostic ?? err) as
            | {
                code?: string;
                flow?: string;
                step?: unknown;
                stepPath?: unknown;
                path?: unknown;
                trace?: unknown;
              }
            | null
            | undefined;
          return {
            code: d?.code,
            flow: d?.flow,
            step: d?.step,
            stepPath: d?.stepPath,
            path: d?.path,
            trace: d?.trace,
          };
        };

        expect(rendererError).toBeDefined();
        const rendererDiagnostic = extractDiagnostic(rendererError);
        expect(rendererDiagnostic.code).toBe(caseConfig.expectedError.code);
        expect(rendererDiagnostic.flow).toBe(caseConfig.expectedError.flow);

        // 2. Compiler observation
        let compilerCaps: CompilerCapture | undefined;
        const GeneratedComponent = createGeneratedComponent(compiledCodes[budgetType]);

        let compilerError: unknown;
        try {
          const rendered = render(
            <GeneratedComponent
              __testCapture={(caps) => {
                compilerCaps = caps;
              }}
            />,
          );

          expect(compilerCaps).toBeDefined();

          if (budgetType === 'concurrencyBudget') {
            const p1 = compilerCaps!.executeFlow!(caseConfig.flow);
            let p2Err: unknown;
            try {
              await compilerCaps!.executeFlow!(caseConfig.flow);
            } catch (err) {
              p2Err = err;
            }
            compilerError = p2Err;
            // Immediately unmount to cancel the still-pending p1 (parity with session.dispose())
            rendered.unmount();
            try {
              await p1;
            } catch {
              // expected p1 aborted
            }
          } else if (budgetType === 'durationBudget') {
            vi.useFakeTimers();
            try {
              await act(async () => {
                const flowPromise = compilerCaps!.executeFlow!(caseConfig.flow);
                flowPromise.catch(() => {});
                await vi.advanceTimersByTimeAsync(100);
                try {
                  await flowPromise;
                } catch (err) {
                  compilerError = err;
                }
              });
            } finally {
              rendered.unmount();
              vi.useRealTimers();
            }
          } else {
            await act(async () => {
              try {
                await compilerCaps!.executeFlow!(caseConfig.flow);
              } catch (err) {
                compilerError = err;
              }
            });
            rendered.unmount();
          }
        } finally {
          cleanup();
        }

        expect(compilerError).toBeDefined();
        const compilerDiagnostic = extractDiagnostic(compilerError);
        expect(compilerDiagnostic.code).toBe(caseConfig.expectedError.code);
        expect(compilerDiagnostic.flow).toBe(caseConfig.expectedError.flow);

        // 3. Direct engine parity check (code, flow, path, trace)
        expect(rendererDiagnostic.code).toBe(compilerDiagnostic.code);
        expect(rendererDiagnostic.flow).toBe(compilerDiagnostic.flow);
        expect(rendererDiagnostic.path).toEqual(compilerDiagnostic.path);
        expect(rendererDiagnostic.trace).toEqual(compilerDiagnostic.trace);
      });
    }
  });
});
