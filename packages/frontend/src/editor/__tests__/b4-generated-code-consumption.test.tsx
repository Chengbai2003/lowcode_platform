/**
 * B4 生成代码真实消费验证（Issue #39 / M1F-2 B4）。
 *
 * 链路：真实后端 compileToCode（经 scripts/b4-second-preset-compile.cjs 子进程）
 * → 使用 @lowcode-platform/preset-test 的真实 Compiler Bindings 生成代码
 * → 生成的 import 指向 @lowcode-platform/preset-test/runtime（真实 dist 模块）
 * → transpile + 受限 require（react + 真实 preset-test runtime，其余一律拒绝）
 * → jsdom 挂载、点击行为断言，并与同一 schema 经真实 Renderer 渲染的结果对照。
 *
 * 安全用例：对 Contract 合法但携带危险 Props（字符串型 on*、
 * dangerouslySetInnerHTML、javascript: href）的页面，编译产物经真实 runtime
 * 挂载后不得向 DOM 注入任何危险属性或 HTML（runtime 自防御，不依赖 Renderer
 * 的 Manifest 净化）。
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import React from 'react';
import ts from 'typescript';
import { Renderer, LowcodeProvider } from '@lowcode-platform/renderer';
import { testPreset, TEST_RUNTIME_COMPATIBILITY } from '@lowcode-platform/preset-test';
import type { PageSchema } from '../types';

const repoRoot = path.resolve(__dirname, '../../../../../');

interface BridgeResult {
  main: { code: string; schema: PageSchema };
  dangerous: { code: string; schema: PageSchema };
  runtimeCompatibility: {
    componentPresetId: string;
    componentPresetVersion: string;
    rendererVersion: string;
  };
}

function compileViaRealBackend(): BridgeResult {
  const stdout = execFileSync(
    process.execPath,
    [path.join(repoRoot, 'scripts/b4-second-preset-compile.cjs')],
    { cwd: repoRoot, encoding: 'utf8', timeout: 60000, maxBuffer: 20 * 1024 * 1024 },
  );
  return JSON.parse(stdout) as BridgeResult;
}

interface CompilerCapture {
  getState: () => Record<string, unknown> | undefined;
}

const frontendRequire = createRequire(path.resolve(repoRoot, 'packages/frontend/package.json'));

function createRestrictedRequire() {
  return function restrictedRequire(specifier: string): unknown {
    if (specifier === 'react') {
      return React;
    }
    if (specifier === '@lowcode-platform/preset-test/runtime') {
      // 真实 dist 模块：证明生成代码的导入路径在消费者包内实际可解析
      return frontendRequire(specifier);
    }
    throw new Error(`Restricted module loader: unauthorized module import "${specifier}"`);
  };
}

function transpileGeneratedComponent(code: string): React.ComponentType<{
  __testCapture?: (caps: CompilerCapture) => void;
}> {
  const headerMarker = 'export default function GeneratedPage() {';
  if (code.match(/export default function GeneratedPage\(\) \{/g)?.length !== 1) {
    throw new Error('Expected exactly 1 GeneratedPage function header');
  }

  const returnMatches = code.match(/\n  return [<(]/g);
  if (!returnMatches || returnMatches.length !== 1) {
    throw new Error(`Expected exactly 1 JSX return statement, found ${returnMatches?.length ?? 0}`);
  }
  const returnIndex = code.lastIndexOf('\n  return ');

  const injection = `
  if (typeof __props !== 'undefined' && __props && typeof __props.__testCapture === 'function') {
    __props.__testCapture({
      getState: () => (typeof stateRef !== 'undefined' ? stateRef.current : (typeof state !== 'undefined' ? state : undefined)),
    });
  }
`;

  const injectedCode =
    code
      .slice(0, returnIndex)
      .replace(headerMarker, 'export default function GeneratedPage(__props = {}) {') +
    injection +
    code.slice(returnIndex);

  const transpiled = ts.transpileModule(injectedCode, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
    reportDiagnostics: true,
  });
  const errors = (transpiled.diagnostics ?? [])
    .filter((d) => d.category === ts.DiagnosticCategory.Error)
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
  if (errors.length > 0) {
    throw new Error(`TypeScript compilation failed:\n${errors.join('\n')}`);
  }

  const moduleRecord: { exports: { default?: React.ComponentType<never> } } = { exports: {} };
  const runner = new Function('require', 'exports', 'module', 'fetch', transpiled.outputText);
  runner(createRestrictedRequire(), moduleRecord.exports, moduleRecord, globalThis.fetch);
  const Component = moduleRecord.exports.default;
  if (typeof Component !== 'function') {
    throw new Error('Generated module did not export a default React component function');
  }
  return Component as unknown as React.ComponentType<{
    __testCapture?: (caps: CompilerCapture) => void;
  }>;
}

describe('B4 第二个 Preset：Compiler 生成代码真实消费（Issue #39）', () => {
  let bridge: BridgeResult;

  beforeAll(() => {
    bridge = compileViaRealBackend();
  });

  it('真实 generator 输出新包导入路径，且绑定与 preset 身份一致', () => {
    expect(bridge.runtimeCompatibility).toEqual(TEST_RUNTIME_COMPATIBILITY);
    expect(bridge.main.code).toContain('from "@lowcode-platform/preset-test/runtime"');
    expect(bridge.main.code).toMatch(
      /import \{[^}]*Button[^}]*\} from "@lowcode-platform\/preset-test\/runtime";/,
    );
    // 不允许出现测试桩字符串：生成代码必须绑定真实包，而非虚构库
    expect(bridge.main.code).not.toContain('lib-b');
    expect(bridge.main.code).not.toContain('from "antd"');
    // feedback(kind: notification) 从 defaultLibrary（本包 runtime）导入 notification
    expect(bridge.main.code).toMatch(
      /import \{[^}]*notification[^}]*\} from "@lowcode-platform\/preset-test\/runtime";/,
    );
  });

  it('生成模块可解析、可构建并在 jsdom 挂载，message/notification 与点击行为和 Renderer 一致', async () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});

    const GeneratedPage = transpileGeneratedComponent(bridge.main.code);
    let captured: CompilerCapture | undefined;
    const { container: generatedContainer } = render(
      <GeneratedPage __testCapture={(caps) => (captured = caps)} />,
    );

    // 生成的 DOM：真实 preset-test runtime 的标记与样式
    expect(generatedContainer.querySelector('[data-preset-test="container"]')).not.toBeNull();
    expect(generatedContainer.querySelector('[data-preset-test="text"]')!.textContent).toBe(
      'b4-preset-test-counter',
    );
    const generatedButton = generatedContainer.querySelector(
      'button[data-preset-test="button"]',
    ) as HTMLButtonElement;
    expect(generatedButton.textContent).toBe('increment');
    expect(generatedButton.getAttribute('style')).toContain('monospace');
    expect(generatedButton.className).not.toMatch(/ant-/);

    // 点击：message 与 notification 都走真实 runtime 导出的最小实现，setValue 更新状态
    fireEvent.click(generatedButton);
    await waitFor(() => {
      expect(captured?.getState()?.['count']).toBe(5);
    });
    expect(consoleInfo).toHaveBeenCalledWith('[preset-test:success]', 'b4-compiled-click');
    expect(consoleInfo).toHaveBeenCalledWith('[preset-test:notification:success]', {
      message: 'b4-compiled-notification',
      description: 'compiled notification description',
    });

    // 同一 schema 经真实 Renderer 渲染对照：标记与关键文本一致
    const rendererMessage = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
    const { container: rendererContainer } = render(
      <LowcodeProvider>
        <Renderer
          preset={testPreset}
          pageId="p-b4-parity"
          documentSessionId="doc-b4"
          schema={bridge.main.schema as never}
          eventContext={{ ui: { message: rendererMessage } }}
        />
      </LowcodeProvider>,
    );

    expect(rendererContainer.querySelector('[data-preset-test="container"]')).not.toBeNull();
    expect(rendererContainer.querySelector('[data-preset-test="text"]')!.textContent).toBe(
      'b4-preset-test-counter',
    );
    const rendererButton = rendererContainer.querySelector(
      'button[data-preset-test="button"]',
    ) as HTMLButtonElement;
    expect(rendererButton.textContent).toBe('increment');

    // Renderer 侧点击同一行为：feedback 内容与生成代码一致
    fireEvent.click(rendererButton);
    await waitFor(() => {
      expect(rendererMessage.success).toHaveBeenCalledWith('b4-compiled-click');
    });

    consoleInfo.mockRestore();
  });

  it('危险 Props 的编译产物挂载后无法向 DOM 注入（runtime 自防御，不依赖 Renderer 净化）', () => {
    expect(bridge.dangerous.code).toContain('onerror');
    expect(bridge.dangerous.code).toContain('dangerouslySetInnerHTML');

    const DangerousPage = transpileGeneratedComponent(bridge.dangerous.code);
    const { container } = render(<DangerousPage />);

    // 编译产物确实携带危险 Props 字面量，但真实 runtime 不透传给 DOM
    const button = container.querySelector('button[data-preset-test="button"]')!;
    expect(button.textContent).toBe('危险按钮');
    expect(button.hasAttribute('onerror')).toBe(false);
    expect(button.getAttribute('onerror')).toBeNull();
    expect(button.hasAttribute('href')).toBe(false);
    expect(container.querySelector('b')).toBeNull();

    const text = container.querySelector('[data-preset-test="text"]')!;
    expect(text.hasAttribute('data-evil')).toBe(false);
    expect(container.querySelector('img')).toBeNull();

    const root = container.querySelector('[data-preset-test="container"]')!;
    expect(root.hasAttribute('onerror')).toBe(false);
  });
});
