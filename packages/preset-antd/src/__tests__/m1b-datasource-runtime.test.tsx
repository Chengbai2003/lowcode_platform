/**
 * M1b-1 PR C：preset-antd 侧 executeDataSource 挂载验收（与 renderer 包
 * preset-test 的 R1 用例同构：真实 loopback HTTP + 点击 + 整值提交 + 重渲染）。
 *
 * 双 Preset 覆盖是计划 §6 的显式要求；本文件补齐 antd 侧证据，
 * 不以「Preset 正交」论证替代。
 */
import { readFileSync } from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';
import { CONSUMER_SURFACES, createTestCapabilityMatrix } from '@lowcode-platform/schema-contract';
import type { DataSourceExecutionOutcome } from '@lowcode-platform/schema-contract';
import { Renderer } from '@lowcode-platform/renderer';
import { antdPreset } from '../createAntdPreset';

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: () => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

const require = createRequire(import.meta.url);

const m1bFixture = JSON.parse(
  readFileSync(
    path.resolve(__dirname, '../../../../test-fixtures/m1b-datasource-conformance.json'),
    'utf8',
  ),
) as { schema: Record<string, unknown> };

/** 进程内可信测试矩阵（生产清单字节不变） */
function patchManifestForTestMatrix(): () => void {
  const manifestPath = path.join(
    path.dirname(require.resolve('@lowcode-platform/schema-contract')),
    'capabilities',
    'manifest.js',
  );
  const manifestModule = require(manifestPath);
  const policyPath = path.join(path.dirname(manifestPath), 'policy.js');
  const policyModule = require(policyPath);
  const original = manifestModule.getTrustedCapabilityManifest;
  const originalPolicy = policyModule.getTrustedExecutionPolicy;
  const supportedAll: Record<string, unknown> = {};
  for (const surface of CONSUMER_SURFACES) {
    supportedAll[surface] = { status: 'supported', revision: 1 };
  }
  manifestModule.getTrustedCapabilityManifest = () => ({
    manifestVersion: 1,
    matrix: createTestCapabilityMatrix({ 'data-source': supportedAll }),
  });
  policyModule.getTrustedExecutionPolicy = () => 'operation-only';
  return () => {
    manifestModule.getTrustedCapabilityManifest = original;
    policyModule.getTrustedExecutionPolicy = originalPolicy;
  };
}

describe('preset-antd executeDataSource mounted acceptance (M1b-1 PR C / Refs #64)', () => {
  let restoreManifest: (() => void) | undefined;

  beforeEach(() => {
    restoreManifest = patchManifestForTestMatrix();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    restoreManifest?.();
  });

  it('antd Preset: click → host service → real loopback HTTP → whole-result commit → re-render', async () => {
    const upstreamHits: Array<Record<string, unknown>> = [];
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        upstreamHits.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            result: {
              items: [
                { id: 'a', title: 'Apple' },
                { id: 'b', title: 'Banana' },
              ],
            },
            operationId: 'demo.items.search',
            revision: '1',
            traceId: 'trace-antd-r1',
          }),
        );
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as { port: number }).port;

    const adapterRequests: Array<{ sourceId: string; params?: Record<string, unknown> }> = [];
    const service = {
      execute: async (
        input: { sourceId: string; params?: Record<string, unknown> },
        signal?: AbortSignal,
      ): Promise<DataSourceExecutionOutcome> => {
        adapterRequests.push({ sourceId: input.sourceId, params: input.params });
        const response = await fetch(`http://127.0.0.1:${port}/exec`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
          signal,
        });
        return (await response.json()) as DataSourceExecutionOutcome;
      },
    };

    // 与 renderer R1 同构的变体 schema（非钉死 fixture 本体）：
    // rows 初始为对象、Span 探针展示 rows.items.length（antd 无 Text 组件）
    const variant = JSON.parse(JSON.stringify(m1bFixture.schema));
    variant.logic.states.rows = { items: [] };
    variant.components.root.childrenIds = ['searchBtn', 'probe'];
    variant.components.probe = {
      id: 'probe',
      type: 'Span',
      props: { children: '{{ state.rows.items.length }}' },
    };

    render(
      <Renderer
        schema={variant}
        preset={antdPreset}
        pageId="antd-r1-page"
        documentSessionId="antd-r1-doc"
        hostCapabilities={{ dataResources: true }}
        eventContext={{ dataSources: service }}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /查\s*询/ }));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // 真实链路：适配器捕获已求值参数 → loopback 命中一次 → 校验后整值写入 → 重渲染
    expect(adapterRequests).toEqual([{ sourceId: 'searchItems', params: { query: '' } }]);
    expect(upstreamHits).toEqual([{ sourceId: 'searchItems', params: { query: '' } }]);
    expect(screen.getByText('2')).toBeTruthy();

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
