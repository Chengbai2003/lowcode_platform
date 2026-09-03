import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

interface LiveReportCase {
  status: string;
  telemetry: {
    latencyMs: number | null;
    toolCalls: unknown;
  };
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildLiveReport, summarizeLiveResults, toEvalReportCase } =
  require('./live-report.cjs') as {
    buildLiveReport: (input: Record<string, unknown>) => Record<string, unknown>;
    summarizeLiveResults: (results: Array<Record<string, unknown>>) => Record<string, unknown>;
    toEvalReportCase: (result: Record<string, unknown>) => LiveReportCase;
  };

const execFileAsync = promisify(execFile);

describe('Live Eval report summary', () => {
  it('reports skipped coverage separately from first-pass success', () => {
    expect(
      summarizeLiveResults([
        ...Array.from({ length: 17 }, (_, index) => ({
          id: `run-${index}`,
          skipped: false,
          firstPassSuccess: true,
          latencyMs: 10,
        })),
        ...Array.from({ length: 3 }, (_, index) => ({ id: `skip-${index}`, skipped: true })),
      ]),
    ).toMatchObject({
      totalCases: 20,
      executedCases: 17,
      skippedCases: 3,
      coverageRate: 0.85,
      firstPassSuccessRate: 1,
    });
  });

  it('uses explicit infra status and drops trace input/output summaries from telemetry', () => {
    const reportCase = toEvalReportCase({
      id: 'infra',
      category: 'patch',
      title: 'infra',
      status: 'infra_error',
      error: 'connection refused',
      latencyMs: 12,
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cost: 0.01,
      repairCount: 1,
      toolCalls: [
        {
          toolName: 'preview_patch',
          success: false,
          inputSummary: 'secret input',
          outputSummary: 'secret output',
        },
      ],
    });

    expect(reportCase).toMatchObject({
      status: 'infra_error',
      telemetry: {
        latencyMs: 12,
        toolCalls: [{ toolName: 'preview_patch', success: false }],
      },
    });
    expect(JSON.stringify(reportCase)).not.toContain('secret');
    expect(reportCase).not.toHaveProperty('mismatches');
  });

  it('distinguishes a real empty trace from an incomplete trace', () => {
    const emptyTrace = toEvalReportCase({
      id: 'empty-trace',
      category: 'patch',
      title: 'empty trace',
      status: 'passed',
      toolCalls: [],
    });
    const incompleteTrace = toEvalReportCase({
      id: 'incomplete-trace',
      category: 'patch',
      title: 'incomplete trace',
      status: 'passed',
      toolCalls: [{ toolName: 'preview_patch' }],
    });

    expect(emptyTrace.telemetry.toolCalls).toEqual([]);
    expect(incompleteTrace.telemetry.toolCalls).toBeNull();
  });

  it('normalizes invalid telemetry integers to null before report validation', () => {
    const reportCase = toEvalReportCase({
      id: 'invalid-telemetry',
      category: 'patch',
      title: 'invalid telemetry',
      status: 'passed',
      latencyMs: -1,
      usage: { promptTokens: -1, completionTokens: Number.MAX_SAFE_INTEGER + 1, totalTokens: -2 },
      cost: Infinity,
      repairCount: -1,
    });

    expect(reportCase.telemetry).toMatchObject({
      latencyMs: null,
      usage: null,
      cost: null,
      repairCount: null,
    });
  });

  it('publishes an infra-error report when a live run cannot discover runtime metadata', () => {
    const report = buildLiveReport({
      run: {
        runId: 'live-infra',
        mode: 'live',
        generatedAt: '2026-09-03T00:00:00.000Z',
        revision: 'abc123',
        revisionSource: 'target_declaration',
        provider: 'openai',
        model: 'target-model',
        modelSelectionSource: 'requested',
      },
      environment: {
        contract: {
          packageVersion: '1.0.0',
          packageVersionSource: 'target_declaration',
          pageSchemaVersion: null,
          evalCaseSchemaVersion: 1,
        },
        runtimeCompatibility: null,
        sourceVersions: {
          prompt: 'declared-prompt',
          tool: 'declared-tool',
          manifest: 'declared-manifest',
          source: 'target_declaration',
        },
      },
      results: [
        {
          id: 'infra',
          category: 'patch',
          title: 'infra',
          status: 'infra_error',
          error: 'connection refused',
        },
      ],
    });

    expect(report).toMatchObject({
      environment: { runtimeCompatibility: null },
      coverage: { infraErrorCases: 1, coverageRate: 0 },
      metrics: { expectedOutcomeRate: null, replayReproducibility: null },
    });
  });

  it('marks trace endpoint failures as infra errors instead of quality failures', async () => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const send = (status: number, body: unknown) => {
        response.writeHead(status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(body));
      };
      if (/\/pages\/[^/]+\/schema$/.test(url.pathname)) {
        if (request.method === 'PUT') return send(200, { data: { pageVersion: 1 } });
        return send(200, {
          data: {
            schema: { schemaVersion: 0 },
            runtimeCompatibility: {
              componentPresetId: 'builtin-antd',
              componentPresetVersion: '0.1.0',
              rendererVersion: '1.0.0',
            },
          },
        });
      }
      if (url.pathname === '/api/v1/agent/edit') {
        return send(200, { data: { traceId: 'trace-unavailable', mode: 'patch' } });
      }
      if (url.pathname === '/api/v1/agent/traces/trace-unavailable') {
        return send(503, { error: { code: 'TRACE_SERVICE_UNAVAILABLE' } });
      }
      return send(404, { error: { code: 'NOT_FOUND' } });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Expected TCP test server address');
    const artifactDir = await mkdtemp(join(tmpdir(), 'agent-eval-live-trace-'));

    try {
      await execFileAsync(process.execPath, [join(__dirname, 'run-live.mjs')], {
        cwd: join(__dirname, '../..'),
        env: {
          ...process.env,
          AGENT_EVAL_BASE_URL: `http://127.0.0.1:${address.port}/api/v1`,
          AGENT_EVAL_TOKEN: 'fixture',
          AGENT_EVAL_ARTIFACT_DIR: artifactDir,
          AGENT_EVAL_TARGET_REVISION: 'target-revision',
          AGENT_EVAL_CONTRACT_PACKAGE_VERSION: 'target-contract-v1',
          AGENT_EVAL_PROMPT_VERSION: 'target-prompt-v1',
          AGENT_EVAL_TOOL_VERSION: 'target-tool-v1',
          AGENT_EVAL_MANIFEST_VERSION: 'test-manifest',
          AGENT_EVAL_PROVIDER: 'openai',
          AGENT_EVAL_MODEL_ID: 'target-model',
        },
      });
      const report = JSON.parse(await readFile(join(artifactDir, 'live.json'), 'utf-8')) as {
        coverage: { executedCases: number; infraErrorCases: number };
        cases: Array<{ telemetry: { toolCalls: unknown } }>;
      };
      const markdown = await readFile(join(artifactDir, 'live.md'), 'utf-8');

      expect(report.coverage).toMatchObject({ executedCases: 0, infraErrorCases: 14 });
      expect(report.cases.every((evalCase) => evalCase.telemetry.toolCalls === null)).toBe(true);
      expect(markdown).not.toContain('Trace ID');
      expect(markdown).not.toContain('trace-unavailable');
    } finally {
      await rm(artifactDir, { recursive: true, force: true });
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('records an observable Trace for expected HTTP rejections', async () => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const send = (status: number, body: unknown) => {
        response.writeHead(status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(body));
      };
      if (/\/pages\/[^/]+\/schema$/.test(url.pathname)) {
        if (request.method === 'PUT') return send(200, { data: { pageVersion: 1 } });
        return send(200, {
          data: {
            schema: { schemaVersion: 0 },
            runtimeCompatibility: {
              componentPresetId: 'builtin-antd',
              componentPresetVersion: '0.1.0',
              rendererVersion: '1.0.0',
            },
          },
        });
      }
      if (url.pathname === '/api/v1/agent/edit') {
        return send(400, { code: 'SCHEMA_INVALID', traceId: 'trace-rejected' });
      }
      if (url.pathname === '/api/v1/agent/traces/trace-rejected') {
        return send(200, {
          data: {
            success: false,
            toolCalls: [
              {
                toolName: 'validate_patch',
                success: false,
                inputSummary: 'must-not-be-published',
              },
            ],
          },
        });
      }
      return send(404, { error: { code: 'NOT_FOUND' } });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Expected TCP test server address');
    const artifactDir = await mkdtemp(join(tmpdir(), 'agent-eval-live-rejection-'));

    try {
      await execFileAsync(process.execPath, [join(__dirname, 'run-live.mjs')], {
        cwd: join(__dirname, '../..'),
        env: {
          ...process.env,
          AGENT_EVAL_BASE_URL: `http://127.0.0.1:${address.port}/api/v1`,
          AGENT_EVAL_TOKEN: 'fixture',
          AGENT_EVAL_ARTIFACT_DIR: artifactDir,
          AGENT_EVAL_TARGET_REVISION: 'target-revision',
          AGENT_EVAL_CONTRACT_PACKAGE_VERSION: 'target-contract-v1',
          AGENT_EVAL_PROMPT_VERSION: 'target-prompt-v1',
          AGENT_EVAL_TOOL_VERSION: 'target-tool-v1',
          AGENT_EVAL_MANIFEST_VERSION: 'test-manifest',
          AGENT_EVAL_PROVIDER: 'openai',
          AGENT_EVAL_MODEL_ID: 'target-model',
        },
      });
      const report = JSON.parse(await readFile(join(artifactDir, 'live.json'), 'utf-8')) as {
        cases: Array<{ status: string; telemetry: { toolCalls: unknown } }>;
      };
      const successfulRejections = report.cases.filter((evalCase) => evalCase.status === 'passed');

      expect(successfulRejections.length).toBeGreaterThan(0);
      expect(successfulRejections.every((evalCase) => evalCase.telemetry.toolCalls !== null)).toBe(
        true,
      );
      expect(JSON.stringify(report)).not.toContain('must-not-be-published');
    } finally {
      await rm(artifactDir, { recursive: true, force: true });
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('separates observable rejection failures from missing trace infrastructure', async () => {
    const server = createServer(async (request, response) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const send = (status: number, body: unknown) => {
        response.writeHead(status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(body));
      };
      if (/\/pages\/[^/]+\/schema$/.test(url.pathname)) {
        if (request.method === 'PUT') return send(200, { data: { pageVersion: 1 } });
        return send(200, {
          data: {
            schema: { schemaVersion: 0 },
            runtimeCompatibility: {
              componentPresetId: 'builtin-antd',
              componentPresetVersion: '0.1.0',
              rendererVersion: '1.0.0',
            },
          },
        });
      }
      if (url.pathname === '/api/v1/agent/edit') {
        let rawBody = '';
        for await (const chunk of request) rawBody += chunk;
        const payload = JSON.parse(rawBody) as { pageId: string };
        if (payload.pageId.endsWith('validation-missing-root-id')) {
          return send(200, {
            data: {
              traceId: 'trace-unexpected-success',
              mode: 'schema',
              requiresConfirmation: false,
            },
          });
        }
        if (payload.pageId.endsWith('validation-custom-script-action')) {
          return send(400, { code: 'UNEXPECTED_ERROR', traceId: 'trace-unexpected-error' });
        }
        return send(400, { code: 'SCHEMA_INVALID' });
      }
      if (url.pathname === '/api/v1/agent/traces/trace-unexpected-success') {
        return send(200, { data: { success: true, toolCalls: [] } });
      }
      if (url.pathname === '/api/v1/agent/traces/trace-unexpected-error') {
        return send(200, { data: { success: false, toolCalls: [] } });
      }
      return send(404, { error: { code: 'NOT_FOUND' } });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Expected TCP test server address');
    const artifactDir = await mkdtemp(join(tmpdir(), 'agent-eval-live-missing-trace-'));

    try {
      await execFileAsync(process.execPath, [join(__dirname, 'run-live.mjs')], {
        cwd: join(__dirname, '../..'),
        env: {
          ...process.env,
          AGENT_EVAL_BASE_URL: `http://127.0.0.1:${address.port}/api/v1`,
          AGENT_EVAL_TOKEN: 'fixture',
          AGENT_EVAL_ARTIFACT_DIR: artifactDir,
          AGENT_EVAL_TARGET_REVISION: 'target-revision',
          AGENT_EVAL_CONTRACT_PACKAGE_VERSION: 'target-contract-v1',
          AGENT_EVAL_PROMPT_VERSION: 'target-prompt-v1',
          AGENT_EVAL_TOOL_VERSION: 'target-tool-v1',
          AGENT_EVAL_MANIFEST_VERSION: 'test-manifest',
          AGENT_EVAL_PROVIDER: 'openai',
          AGENT_EVAL_MODEL_ID: 'target-model',
        },
      });
      const report = JSON.parse(await readFile(join(artifactDir, 'live.json'), 'utf-8')) as {
        cases: Array<{ id: string; status: string }>;
      };

      const statusById = Object.fromEntries(
        report.cases.map((evalCase) => [evalCase.id, evalCase.status]),
      );

      expect(statusById['validation-missing-root-id']).toBe('failed');
      expect(statusById['validation-custom-script-action']).toBe('failed');
      expect(statusById['validation-legacy-version-field']).toBe('infra_error');
    } finally {
      await rm(artifactDir, { recursive: true, force: true });
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('marks invalid page setup versions as infra errors before agent edit', async () => {
    let agentEditRequests = 0;
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const send = (status: number, body: unknown) => {
        response.writeHead(status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(body));
      };
      if (/\/pages\/[^/]+\/schema$/.test(url.pathname) && request.method === 'PUT') {
        return send(200, { data: { pageVersion: 0 } });
      }
      if (url.pathname === '/api/v1/agent/edit') {
        agentEditRequests += 1;
        return send(409, { code: 'PAGE_VERSION_CONFLICT' });
      }
      return send(404, { error: { code: 'NOT_FOUND' } });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Expected TCP test server address');
    const artifactDir = await mkdtemp(join(tmpdir(), 'agent-eval-live-page-version-'));

    try {
      await execFileAsync(process.execPath, [join(__dirname, 'run-live.mjs')], {
        cwd: join(__dirname, '../..'),
        env: {
          ...process.env,
          AGENT_EVAL_BASE_URL: `http://127.0.0.1:${address.port}/api/v1`,
          AGENT_EVAL_TOKEN: 'fixture',
          AGENT_EVAL_ARTIFACT_DIR: artifactDir,
          AGENT_EVAL_TARGET_REVISION: 'target-revision',
          AGENT_EVAL_CONTRACT_PACKAGE_VERSION: 'target-contract-v1',
          AGENT_EVAL_PROMPT_VERSION: 'target-prompt-v1',
          AGENT_EVAL_TOOL_VERSION: 'target-tool-v1',
          AGENT_EVAL_MANIFEST_VERSION: 'test-manifest',
          AGENT_EVAL_PROVIDER: 'openai',
          AGENT_EVAL_MODEL_ID: 'target-model',
        },
      });
      const report = JSON.parse(await readFile(join(artifactDir, 'live.json'), 'utf-8')) as {
        coverage: { executedCases: number; infraErrorCases: number };
      };

      expect(agentEditRequests).toBe(0);
      expect(report.coverage).toMatchObject({ executedCases: 0, infraErrorCases: 14 });
    } finally {
      await rm(artifactDir, { recursive: true, force: true });
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('marks agent edit endpoint failures as infra errors instead of quality failures', async () => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const send = (status: number, body: unknown) => {
        response.writeHead(status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(body));
      };
      if (/\/pages\/[^/]+\/schema$/.test(url.pathname)) {
        if (request.method === 'PUT') return send(200, { data: { pageVersion: 1 } });
        return send(200, {
          data: {
            schema: { schemaVersion: 0 },
            runtimeCompatibility: {
              componentPresetId: 'builtin-antd',
              componentPresetVersion: '0.1.0',
              rendererVersion: '1.0.0',
            },
          },
        });
      }
      if (url.pathname === '/api/v1/agent/edit') {
        return send(503, { error: { code: 'AGENT_SERVICE_UNAVAILABLE' } });
      }
      return send(404, { error: { code: 'NOT_FOUND' } });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Expected TCP test server address');
    const artifactDir = await mkdtemp(join(tmpdir(), 'agent-eval-live-agent-'));

    try {
      await execFileAsync(process.execPath, [join(__dirname, 'run-live.mjs')], {
        cwd: join(__dirname, '../..'),
        env: {
          ...process.env,
          AGENT_EVAL_BASE_URL: `http://127.0.0.1:${address.port}/api/v1`,
          AGENT_EVAL_TOKEN: 'fixture',
          AGENT_EVAL_ARTIFACT_DIR: artifactDir,
          AGENT_EVAL_TARGET_REVISION: 'target-revision',
          AGENT_EVAL_CONTRACT_PACKAGE_VERSION: 'target-contract-v1',
          AGENT_EVAL_PROMPT_VERSION: 'target-prompt-v1',
          AGENT_EVAL_TOOL_VERSION: 'target-tool-v1',
          AGENT_EVAL_MANIFEST_VERSION: 'test-manifest',
          AGENT_EVAL_PROVIDER: 'openai',
          AGENT_EVAL_MODEL_ID: 'target-model',
        },
      });
      const report = JSON.parse(await readFile(join(artifactDir, 'live.json'), 'utf-8')) as {
        coverage: { executedCases: number; infraErrorCases: number };
      };

      expect(report.coverage).toMatchObject({ executedCases: 0, infraErrorCases: 14 });
    } finally {
      await rm(artifactDir, { recursive: true, force: true });
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('marks Repository CAS conflict fixtures unsupported until A3 maps exact operations', async () => {
    const agentPageIds: string[] = [];
    const server = createServer(async (request, response) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const send = (status: number, body: unknown) => {
        response.writeHead(status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(body));
      };
      if (/\/pages\/[^/]+\/schema$/.test(url.pathname)) {
        if (request.method === 'PUT') return send(200, { data: { pageVersion: 1 } });
        return send(200, {
          data: {
            schema: { schemaVersion: 0 },
            runtimeCompatibility: {
              componentPresetId: 'builtin-antd',
              componentPresetVersion: '0.1.0',
              rendererVersion: '1.0.0',
            },
          },
        });
      }
      if (url.pathname === '/api/v1/agent/edit') {
        let rawBody = '';
        for await (const chunk of request) rawBody += chunk;
        const payload = JSON.parse(rawBody) as {
          pageId: string;
          responseMode: string;
        };
        agentPageIds.push(payload.pageId);
        return send(200, {
          data: {
            traceId: 'trace-complete',
            mode: payload.responseMode,
            requiresConfirmation: false,
          },
        });
      }
      if (url.pathname === '/api/v1/agent/traces/trace-complete') {
        return send(200, { data: { success: true, pageVersionConflictCount: 0, toolCalls: [] } });
      }
      return send(404, { error: { code: 'NOT_FOUND' } });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Expected TCP test server address');
    const artifactDir = await mkdtemp(join(tmpdir(), 'agent-eval-live-conflict-'));

    try {
      await execFileAsync(process.execPath, [join(__dirname, 'run-live.mjs')], {
        cwd: join(__dirname, '../..'),
        env: {
          ...process.env,
          AGENT_EVAL_BASE_URL: `http://127.0.0.1:${address.port}/api/v1`,
          AGENT_EVAL_TOKEN: 'fixture',
          AGENT_EVAL_ARTIFACT_DIR: artifactDir,
          AGENT_EVAL_TARGET_REVISION: 'target-revision',
          AGENT_EVAL_CONTRACT_PACKAGE_VERSION: 'target-contract-v1',
          AGENT_EVAL_PROMPT_VERSION: 'target-prompt-v1',
          AGENT_EVAL_TOOL_VERSION: 'target-tool-v1',
          AGENT_EVAL_MANIFEST_VERSION: 'test-manifest',
          AGENT_EVAL_PROVIDER: 'openai',
          AGENT_EVAL_MODEL_ID: 'target-model',
        },
      });
      const report = JSON.parse(await readFile(join(artifactDir, 'live.json'), 'utf-8')) as {
        cases: Array<{
          id: string;
          category: string;
          status: string;
          telemetry: { toolCalls: unknown };
        }>;
      };
      const conflictCases = report.cases.filter((evalCase) => evalCase.category === 'conflict');

      expect(conflictCases.map(({ id, status }) => ({ id, status }))).toEqual([
        { id: 'conflict-cas-integrity', status: 'unsupported' },
        { id: 'conflict-missing-base-rejected', status: 'unsupported' },
        { id: 'conflict-stale-base-rejected', status: 'unsupported' },
      ]);
      expect(agentPageIds.some((pageId) => pageId.includes('-conflict-'))).toBe(false);
      expect(
        report.cases.some(
          (evalCase) =>
            Array.isArray(evalCase.telemetry.toolCalls) &&
            evalCase.telemetry.toolCalls.length === 0,
        ),
      ).toBe(true);
    } finally {
      await rm(artifactDir, { recursive: true, force: true });
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('requires target-declared metadata instead of reading the local checkout', async () => {
    try {
      await execFileAsync(process.execPath, [join(__dirname, 'run-live.mjs')], {
        cwd: join(__dirname, '../..'),
        env: {
          ...process.env,
          AGENT_EVAL_TOKEN: 'fixture',
          AGENT_EVAL_TARGET_REVISION: '',
        },
      });
      throw new Error('Expected run-live.mjs to reject missing target metadata');
    } catch (error) {
      const stderr = (error as { stderr?: string }).stderr ?? '';
      expect(stderr).toContain('AGENT_EVAL_TARGET_REVISION');
    }
  });
});
