import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { fetchApp } from '../../lib/httpClient';
import {
  createPreviewDataSourceHostService,
  mapDataSourceExecuteResponse,
  mintLocalDataSourceTraceId,
  DATA_SOURCE_BINDING_DIRTY_MESSAGE,
} from '../dataSourceHostApi';

/**
 * D3/D7（M1b-1 PR D / 计划 §3.1–§3.2）：
 * - 映射表全量：成功完整字段校验、八码完整体直传、残缺体/非法 JSON/未知码
 *   统一 UPSTREAM_FAILURE 固定消息 + local- traceId、网络失败、abort 取消语义；
 * - 经 fetchApp.request() 原始 Response 路径（B 错误不被误归类网络异常）；
 * - 绑定四元组校验：未绑定/脏页/切页 fail-close 零 HTTP。
 * 响应字节优先取自真实端点录制的共享 fixture（test-fixtures/m1b-d-editor-closure.json）。
 */

const fixture = JSON.parse(
  readFileSync(
    path.resolve(__dirname, '../../../../../../test-fixtures/m1b-d-editor-closure.json'),
    'utf8',
  ),
) as {
  endpointSamples: Record<string, Record<string, unknown>>;
};

/** fixture 样本即响应体本身（sanitizeSample 已在录制侧归一） */
function bodyOf(sample: unknown): unknown {
  return sample;
}

describe('mapDataSourceExecuteResponse（D3 纯函数映射表）', () => {
  it('真实录制的成功响应 → 完整 Success Outcome（信封解包 + 全字段校验）', () => {
    const sample = fixture.endpointSamples.executeSuccess;
    const outcome = mapDataSourceExecuteResponse(200, bodyOf(sample));
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result).toEqual({
        items: [
          { id: 'item-1', title: 'Apple Pie', price: 12 },
          { id: 'item-2', title: 'Apple Juice', price: 8 },
        ],
      });
      expect(outcome.operationId).toBe('demo.items.search');
      expect(outcome.revision).toBe('1');
      expect(typeof outcome.traceId).toBe('string');
      expect(outcome.traceId.length).toBeGreaterThan(0);
    }
  });

  it('畸形成功体（缺 operationId/revision/traceId）不得当成功 → UPSTREAM_FAILURE + local- trace', () => {
    for (const missing of ['operationId', 'revision', 'traceId']) {
      const data = {
        ok: true,
        result: { items: [] },
        operationId: 'demo.items.search',
        revision: '1',
        traceId: 't-1',
      };
      delete (data as Record<string, unknown>)[missing];
      const outcome = mapDataSourceExecuteResponse(200, { success: true, data });
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.code).toBe('UPSTREAM_FAILURE');
        expect(outcome.traceId.startsWith('local-')).toBe(true);
      }
    }
  });

  it('信封缺失（data 为裸对象）→ UPSTREAM_FAILURE', () => {
    const outcome = mapDataSourceExecuteResponse(200, {
      ok: true,
      result: { items: [] },
      operationId: 'demo.items.search',
      revision: '1',
      traceId: 't-1',
    });
    expect(outcome.ok).toBe(false);
  });

  it('真实录制的 INVALID_PARAMS/FORBIDDEN 错误体 → 按码直传（B 已脱敏消息 + 服务端 trace）', () => {
    for (const key of ['executeInvalidParams', 'executeForbidden']) {
      const sample = fixture.endpointSamples[key];
      const outcome = mapDataSourceExecuteResponse(
        key === 'executeInvalidParams' ? 400 : 403,
        bodyOf(sample),
      );
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.code).toBe(key === 'executeInvalidParams' ? 'INVALID_PARAMS' : 'FORBIDDEN');
        expect(outcome.message.length).toBeGreaterThan(0);
        expect(outcome.traceId.startsWith('local-')).toBe(false);
      }
    }
  });

  it('每个 B 错误码的完整体均可直传', () => {
    const codes = [
      'UNKNOWN_OPERATION',
      'FORBIDDEN',
      'CAPABILITY_DENIED',
      'INVALID_PARAMS',
      'INVALID_RESULT',
      'TIMEOUT',
      'UPSTREAM_FAILURE',
      'EXECUTION_BUSY',
    ];
    for (const code of codes) {
      const outcome = mapDataSourceExecuteResponse(502, {
        statusCode: 502,
        code,
        message: `fixed ${code} message`,
        traceId: `server-${code}`,
      });
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.code).toBe(code);
        expect(outcome.message).toBe(`fixed ${code} message`);
        expect(outcome.traceId).toBe(`server-${code}`);
      }
    }
  });

  it('残缺错误体 {code:"TIMEOUT"}（缺 message/traceId）→ UPSTREAM_FAILURE 固定消息 + local- trace（v3 冻结）', () => {
    const outcome = mapDataSourceExecuteResponse(504, { code: 'TIMEOUT' });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe('UPSTREAM_FAILURE');
      expect(outcome.message).toBe(
        'Unexpected response from the data source execution endpoint (fail-close)',
      );
      expect(outcome.traceId.startsWith('local-')).toBe(true);
    }
  });

  it.each([
    ['字段类型错误 message 数字', { code: 'TIMEOUT', message: 1, traceId: 't' }],
    ['traceId 空串', { code: 'TIMEOUT', message: 'm', traceId: '' }],
    ['未知 code', { code: 'SOMETHING_ELSE', message: 'm', traceId: 't' }],
    ['非 JSON（undefined）', undefined],
    ['HTML 错误页字符串体', '<html>Bad Gateway</html>'],
  ])('错误体 %s → UPSTREAM_FAILURE + local-', (_name, body) => {
    const outcome = mapDataSourceExecuteResponse(502, body);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe('UPSTREAM_FAILURE');
      expect(outcome.traceId.startsWith('local-')).toBe(true);
    }
  });

  it('本地 trace 铸造使用 local- 前缀（非服务端 trace 约定）', () => {
    expect(mintLocalDataSourceTraceId().startsWith('local-')).toBe(true);
  });
});

describe('createPreviewDataSourceHostService（D3/D7 适配器）', () => {
  const ORIGINAL_BASE = fetchApp.getBaseURL();
  let server: http.Server;
  let serverUrl: string;
  const requests: { method: string; url: string; body: unknown }[] = [];
  let responder: (req: http.IncomingMessage, res: http.ServerResponse, body: string) => void;

  beforeEach(() => {
    requests.length = 0;
    responder = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(fixture.endpointSamples.executeSuccess));
    };
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        requests.push({
          method: req.method ?? '',
          url: req.url ?? '/',
          body: body ? JSON.parse(body) : undefined,
        });
        responder(req, res, body);
      });
    });
  });

  afterEach(async () => {
    fetchApp.setBaseURL(ORIGINAL_BASE);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function startServer(): Promise<void> {
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        serverUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        fetchApp.setBaseURL(serverUrl);
        resolve();
      });
    });
  }

  function makeService(binding: unknown, revision = 0, generation = 1) {
    return createPreviewDataSourceHostService({
      getBinding: () => binding as never,
      getCurrentSchemaRevision: () => revision,
      getCurrentGeneration: () => generation,
    });
  }

  const BINDING = { pageId: 'p1', pageVersion: 2, schemaRevision: 0, generation: 1 };

  it('D7: 未绑定（null）→ 抛固定消息，零 HTTP（fetch 层零请求）', async () => {
    await startServer();
    const service = makeService(null);
    await expect(service.execute({ sourceId: 'searchItems' })).rejects.toThrow(
      DATA_SOURCE_BINDING_DIRTY_MESSAGE,
    );
    expect(requests).toEqual([]);
  });

  it('D7: pageVersion 为 null（未加载语义）→ 同样 fail-close 零 HTTP', async () => {
    await startServer();
    const service = makeService({ ...BINDING, pageVersion: null });
    await expect(service.execute({ sourceId: 'searchItems' })).rejects.toThrow(
      DATA_SOURCE_BINDING_DIRTY_MESSAGE,
    );
    expect(requests).toEqual([]);
  });

  it('D7: 脏页（schemaRevision 超前）→ fail-close 零 HTTP', async () => {
    await startServer();
    const service = makeService(BINDING, /* current revision */ 3);
    await expect(service.execute({ sourceId: 'searchItems' })).rejects.toThrow(
      DATA_SOURCE_BINDING_DIRTY_MESSAGE,
    );
    expect(requests).toEqual([]);
  });

  it('D7: 切页（generation 不匹配）→ fail-close 零 HTTP', async () => {
    await startServer();
    const service = makeService(BINDING, 0, /* current generation */ 2);
    await expect(service.execute({ sourceId: 'searchItems' })).rejects.toThrow(
      DATA_SOURCE_BINDING_DIRTY_MESSAGE,
    );
    expect(requests).toEqual([]);
  });

  it('干净绑定 → 恰好一次 POST，请求体恰为 {pageVersion, params}（无 pageId/sourceId）', async () => {
    await startServer();
    const service = makeService(BINDING);
    const outcome = await service.execute({
      sourceId: 'searchItems',
      params: { query: 'Apple', limit: 2 },
    });
    expect(outcome.ok).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe('POST');
    expect(requests[0].url).toBe('/api/v1/pages/p1/data-sources/searchItems/execute');
    expect(requests[0].body).toEqual({ pageVersion: 2, params: { query: 'Apple', limit: 2 } });
  });

  it('params 缺省 → 请求体恰为 {pageVersion}', async () => {
    await startServer();
    const service = makeService(BINDING);
    await service.execute({ sourceId: 'searchItems' });
    expect(requests[0].body).toEqual({ pageVersion: 2 });
  });

  it('B 错误经原始 Response 路径直传（不被 .post() 包装误归类为网络异常）', async () => {
    await startServer();
    responder = (_req, res) => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(fixture.endpointSamples.executeInvalidParams));
    };
    const service = makeService(BINDING);
    const outcome = await service.execute({ sourceId: 'searchItems', params: { limit: 99 } });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe('INVALID_PARAMS');
      expect(outcome.traceId.startsWith('local-')).toBe(false);
    }
  });

  it('网络失败 → UPSTREAM_FAILURE 固定消息 + local- trace（不透传 error.message）', async () => {
    // 指向一个已关闭的端口
    await new Promise<void>((resolve) => {
      const dead = http.createServer(() => undefined);
      dead.listen(0, '127.0.0.1', () => {
        const deadUrl = `http://127.0.0.1:${(dead.address() as AddressInfo).port}`;
        dead.close(() => resolve());
        fetchApp.setBaseURL(deadUrl);
      });
    });
    const service = makeService(BINDING);
    const outcome = await service.execute({ sourceId: 'searchItems' });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe('UPSTREAM_FAILURE');
      expect(outcome.message).toBe('Data source execution request failed (network error)');
      expect(outcome.traceId.startsWith('local-')).toBe(true);
    }
  });

  it('调用前 abort → 抛 AbortError，不降级为失败 Outcome', async () => {
    await startServer();
    const controller = new AbortController();
    controller.abort();
    const service = makeService(BINDING);
    await expect(
      service.execute({ sourceId: 'searchItems' }, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(requests).toEqual([]);
  });

  it('响应体读取期间 abort → 抛 AbortError（不把半截响应当失败 Outcome）', async () => {
    await startServer();
    responder = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write('{"success":true,"data":{"ok":true,"res');
      // 永不结束响应体，等客户端 abort
    };
    const controller = new AbortController();
    const service = makeService(BINDING);
    const pending = service.execute({ sourceId: 'searchItems' }, controller.signal);
    setTimeout(() => controller.abort(), 30);
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
