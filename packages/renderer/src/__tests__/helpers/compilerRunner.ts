import { execFileSync } from 'node:child_process';
import path from 'node:path';
import React from 'react';
import ts from 'typescript';

export interface CompilerCapture {
  getState: () => Record<string, unknown> | undefined;
  getData: () => Record<string, unknown> | undefined;
  getComputed: () => Record<string, unknown> | undefined;
  executeFlow: ((flowName: string, input?: unknown) => Promise<unknown>) | undefined;
}

export interface GeneratedPageProps {
  __testCapture?: (caps: CompilerCapture) => void;
  __onExecuteFlow?: (
    flowName: string,
    input: unknown,
    next: () => Promise<unknown>,
  ) => Promise<unknown>;
  [key: string]: unknown;
}

let cachedCompiledCodes: Record<string, string> | null = null;

export function getCompiledConformanceCodes(): Record<string, string> {
  if (cachedCompiledCodes) {
    return cachedCompiledCodes;
  }

  const repoRoot = path.resolve(__dirname, '../../../../../');
  const scriptPath = path.resolve(repoRoot, 'scripts/m1a-compile-conformance.cjs');

  const stdout = execFileSync(process.execPath, [scriptPath, '--cases=all'], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 20 * 1024 * 1024,
  });

  cachedCompiledCodes = JSON.parse(stdout) as Record<string, string>;
  return cachedCompiledCodes;
}

const antdMock = Object.freeze({
  Page: ({ children, ...props }: React.ComponentProps<'div'>) =>
    React.createElement('div', props, children),
  Text: ({ children, ...props }: React.ComponentProps<'span'>) =>
    React.createElement('span', props, children),
  Button: ({ children, ...props }: React.ComponentProps<'button'>) =>
    React.createElement('button', props, children),
  Container: ({ children, ...props }: React.ComponentProps<'section'>) =>
    React.createElement('section', props, children),
  Input: (props: React.ComponentProps<'input'>) => React.createElement('input', props),
  message: Object.freeze({
    info: () => {},
    success: () => {},
    warning: () => {},
    error: () => {},
  }),
  notification: Object.freeze({
    info: () => {},
    success: () => {},
    warning: () => {},
    error: () => {},
  }),
  Modal: Object.freeze({
    confirm: () => ({ destroy: () => {} }),
    info: () => ({ destroy: () => {} }),
  }),
});

function createRestrictedRequire() {
  return function restrictedRequire(specifier: string): unknown {
    if (specifier === 'react') {
      return React;
    }
    if (specifier === 'antd') {
      return antdMock;
    }
    throw new Error(`Restricted module loader: unauthorized module import "${specifier}"`);
  };
}

export function createGeneratedComponent(
  code: string,
  options?: {
    customFetchStub?: typeof fetch;
  },
): React.ComponentType<GeneratedPageProps> {
  const headerMarker = 'export default function GeneratedPage() {';
  const headerMatches = code.match(/export default function GeneratedPage\(\) \{/g);
  if (!headerMatches || headerMatches.length !== 1) {
    throw new Error(
      `Expected exactly 1 GeneratedPage function header, found ${headerMatches?.length ?? 0}`,
    );
  }

  const returnMatches = code.match(/\n  return [<(]/g);
  if (!returnMatches || returnMatches.length !== 1) {
    throw new Error(
      `Expected exactly 1 JSX return statement in GeneratedPage, found ${returnMatches?.length ?? 0}`,
    );
  }

  const returnIndex = code.lastIndexOf('\n  return ');
  const injection = `
  if (typeof __props !== 'undefined' && __props && typeof __props.__testCapture === 'function') {
    __props.__testCapture({
      getState: () => (typeof stateRef !== 'undefined' ? stateRef.current : (typeof state !== 'undefined' ? state : undefined)),
      getData: () => (typeof dataRef !== 'undefined' ? dataRef.current : (typeof data !== 'undefined' ? data : undefined)),
      getComputed: () => (typeof computedRef !== 'undefined' ? computedRef.current : (typeof computed !== 'undefined' ? computed : undefined)),
      executeFlow: typeof executeFlow !== 'undefined' ? executeFlow : undefined,
    });
  }
`;

  const codeBeforeReturn = code.slice(0, returnIndex);
  const codeAfterReturn = code.slice(returnIndex);

  const executeFlowTarget = 'const executeFlow = async (rootFlowName, rawInput) => {';
  let processedBeforeReturn = codeBeforeReturn;
  const executeFlowMatches = codeBeforeReturn.match(
    /const executeFlow = async \(rootFlowName, rawInput\) => \{/g,
  );
  if (executeFlowMatches) {
    if (executeFlowMatches.length !== 1) {
      throw new Error(
        `Expected exactly 1 executeFlow declaration, found ${executeFlowMatches.length}`,
      );
    }
    const wrappedExecuteFlow = `let __rawExecuteFlow;
  const executeFlow = (rootFlowName, rawInput) => {
    if (typeof __props !== 'undefined' && __props && typeof __props.__onExecuteFlow === 'function') {
      return __props.__onExecuteFlow(rootFlowName, rawInput, () => __rawExecuteFlow(rootFlowName, rawInput));
    }
    return __rawExecuteFlow(rootFlowName, rawInput);
  };
  __rawExecuteFlow = async (rootFlowName, rawInput) => {`;
    processedBeforeReturn = processedBeforeReturn.replace(executeFlowTarget, wrappedExecuteFlow);
  }

  const injectedCode =
    processedBeforeReturn.replace(
      headerMarker,
      'export default function GeneratedPage(__props = {}) {',
    ) +
    injection +
    codeAfterReturn;

  const transpiled = ts.transpileModule(injectedCode, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
    reportDiagnostics: true,
  });

  if (transpiled.diagnostics && transpiled.diagnostics.length > 0) {
    const errors = transpiled.diagnostics
      .filter((d) => d.category === ts.DiagnosticCategory.Error)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    if (errors.length > 0) {
      throw new Error(`TypeScript compilation failed:\n${errors.join('\n')}`);
    }
  }

  const moduleRecord: { exports: { default?: React.ComponentType<GeneratedPageProps> } } = {
    exports: {},
  };
  const restrictedRequire = createRestrictedRequire();

  const runner = new Function('require', 'exports', 'module', 'fetch', transpiled.outputText);
  runner(
    restrictedRequire,
    moduleRecord.exports,
    moduleRecord,
    options?.customFetchStub ?? globalThis.fetch,
  );

  const Component = moduleRecord.exports.default;
  if (typeof Component !== 'function') {
    throw new Error('Generated module did not export a default React component function');
  }

  return Component;
}

export function safeSnapshot<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(safeSnapshot) as unknown as T;
  }
  const result: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(value)) {
    result[key] = safeSnapshot((value as Record<string, unknown>)[key]);
  }
  return result as T;
}
