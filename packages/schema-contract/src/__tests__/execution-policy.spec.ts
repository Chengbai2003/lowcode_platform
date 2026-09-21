import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { PageSchema } from '../types/schema';
import { EXECUTION_POLICY_ISSUE_CODES, type ExecutionPolicy } from '../capabilities/policy';
import { createTestCapabilityMatrix } from '../capabilities/manifest';
import { CONSUMER_SURFACES } from '../capabilities/types';
import { evaluatePageSchemaCapabilities } from '../capabilities/evaluate';
import { detectPageSchemaApiCallUsage } from '../capabilities/detect';

/**
 * 可信部署执行策略单测（M1b-1 PR D / 计划 §3.4 / 验收 D6 契约面）。
 *
 * 三条规则 + 顺序冻结：
 * 1. operation-only：递归拒绝一切 apiCall（含纯 apiCall 页面、深层嵌套）；
 * 2. legacy：capability 放行后使用 data-source → 拒绝（不存在隐性 legacy 正向路径）；
 * 3. 模式无关混用拒绝；
 * 4. capability 先行不叠加：已被能力矩阵拒绝的 schema 不追加策略 issue
 *    （既有六面 ingress 断言字节稳定）。
 */

const policyState = vi.hoisted(() => ({ policy: 'legacy' as ExecutionPolicy }));

vi.mock('../capabilities/policy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../capabilities/policy')>();
  return {
    ...actual,
    getTrustedExecutionPolicy: () => policyState.policy,
  };
});

interface M1bFixture {
  schema: PageSchema;
  flowSchema: PageSchema;
  legacyApiCallSchema: PageSchema;
}

const m1bFixture: M1bFixture = JSON.parse(
  readFileSync(
    path.resolve(__dirname, '../../../../test-fixtures/m1b-datasource-conformance.json'),
    'utf8',
  ),
);

function supportedAllMatrix(): unknown {
  const supportedAll: Record<string, unknown> = {};
  for (const surface of CONSUMER_SURFACES) {
    supportedAll[surface] = { status: 'supported', revision: 1 };
  }
  return createTestCapabilityMatrix({ 'data-source': supportedAll });
}

/** 深层嵌套 apiCall：if.then → loop.actions → apiCall.onSuccess（≥3 层） */
function deepNestedApiCallSchema(): PageSchema {
  return {
    schemaVersion: 0,
    rootId: 'root',
    components: {
      root: { id: 'root', type: 'Page' },
      btn: {
        id: 'btn',
        type: 'Button',
        props: { children: '查询' },
        events: {
          onClick: [
            {
              type: 'if',
              condition: { type: 'literal', value: true },
              then: [
                {
                  type: 'loop',
                  over: { type: 'literal', value: [1] },
                  itemVar: 'item',
                  actions: [
                    {
                      type: 'apiCall',
                      url: '/api/legacy',
                      onSuccess: [{ type: 'log', value: { type: 'literal', value: 'x' } }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    },
  } as unknown as PageSchema;
}

/** data-source + Flow onError 内嵌 apiCall 的混用页 */
function mixedFlowSchema(): PageSchema {
  return {
    schemaVersion: 0,
    rootId: 'root',
    components: {
      root: { id: 'root', type: 'Page' },
      btn: {
        id: 'btn',
        type: 'Button',
        props: { children: '查询' },
        events: {
          onClick: [{ type: 'executeDataSource', sourceId: 'searchItems', resultTo: 'state.rows' }],
        },
      },
    },
    logic: {
      states: { rows: [] },
      dataSources: {
        searchItems: { operationRef: { operationId: 'demo.items.search', revision: '1' } },
      },
      flows: {
        legacyFlow: {
          steps: [],
          onError: [{ type: 'apiCall', url: '/api/legacy' }],
        },
      },
    },
  } as unknown as PageSchema;
}

describe('Execution policy (M1b-1 PR D / Refs #64)', () => {
  beforeEach(() => {
    policyState.policy = 'legacy';
  });

  afterEach(() => {
    policyState.policy = 'legacy';
  });

  describe('detectPageSchemaApiCallUsage', () => {
    it('collects apiCall occurrences across nested containers and flow onError', () => {
      const paths = detectPageSchemaApiCallUsage(deepNestedApiCallSchema());
      expect(paths).toHaveLength(1);
      expect(paths[0]).toEqual([
        'components',
        'btn',
        'events',
        'onClick',
        0,
        'then',
        0,
        'actions',
        0,
      ]);
    });

    it('returns empty for pages without apiCall', () => {
      expect(detectPageSchemaApiCallUsage(m1bFixture.schema)).toEqual([]);
      expect(
        detectPageSchemaApiCallUsage({
          schemaVersion: 0,
          rootId: 'r',
          components: {},
        } as unknown as PageSchema),
      ).toEqual([]);
    });

    it('finds apiCall nested inside flow onError', () => {
      const paths = detectPageSchemaApiCallUsage(mixedFlowSchema());
      expect(paths).toHaveLength(1);
      expect(paths[0]).toEqual(['logic', 'flows', 'legacyFlow', 'onError', 0]);
    });
  });

  describe('legacy（生产默认，行为不变）', () => {
    it('keeps pure apiCall pages passing under the real manifest (byte-stable behavior)', () => {
      policyState.policy = 'legacy';
      const result = evaluatePageSchemaCapabilities(m1bFixture.legacyApiCallSchema);
      expect(result.ok).toBe(true);
      expect(result.issues).toEqual([]);
    });

    it('rejects data-source usage when the capability matrix is supported (no implicit legacy positive path)', () => {
      const result = evaluatePageSchemaCapabilities(m1bFixture.schema, supportedAllMatrix());
      expect(result.ok).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].code).toBe(
        EXECUTION_POLICY_ISSUE_CODES.DATASOURCE_REQUIRES_OPERATION_ONLY,
      );
      expect(result.issues[0].message).toContain('operation-only');
    });

    it('rejects mixing data-source with apiCall (mode-independent structural rule)', () => {
      const result = evaluatePageSchemaCapabilities(mixedFlowSchema(), supportedAllMatrix());
      expect(result.ok).toBe(false);
      expect(result.issues[0].code).toBe(EXECUTION_POLICY_ISSUE_CODES.MIXED_NETWORK_ACTIONS);
      expect(result.issues[0].path).toEqual(['logic', 'flows', 'legacyFlow', 'onError', 0]);
    });
  });

  describe('operation-only', () => {
    it('rejects pure apiCall pages under the real manifest (policy independent of matrix)', () => {
      policyState.policy = 'operation-only';
      const result = evaluatePageSchemaCapabilities(m1bFixture.legacyApiCallSchema);
      expect(result.ok).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].code).toBe(EXECUTION_POLICY_ISSUE_CODES.APICALL_FORBIDDEN);
      expect(result.issues[0].message).toContain('operation-only');
    });

    it('rejects deeply nested apiCall (if/loop/onSuccess) with the nested path', () => {
      policyState.policy = 'operation-only';
      const result = evaluatePageSchemaCapabilities(deepNestedApiCallSchema());
      expect(result.ok).toBe(false);
      expect(result.issues[0].code).toBe(EXECUTION_POLICY_ISSUE_CODES.APICALL_FORBIDDEN);
      expect(result.issues[0].path).toEqual([
        'components',
        'btn',
        'events',
        'onClick',
        0,
        'then',
        0,
        'actions',
        0,
      ]);
    });

    it('allows data-source pages when the matrix is supported and no apiCall exists', () => {
      policyState.policy = 'operation-only';
      const result = evaluatePageSchemaCapabilities(m1bFixture.schema, supportedAllMatrix());
      expect(result.ok).toBe(true);
      expect(result.issues).toEqual([]);
    });
  });

  describe('capability 先行，不叠加策略 issue', () => {
    it('data-source schema under the production manifest keeps CAPABILITY_UNSUPPORTED only (any policy)', () => {
      for (const policy of ['legacy', 'operation-only'] as const) {
        policyState.policy = policy;
        const result = evaluatePageSchemaCapabilities(m1bFixture.schema);
        expect(result.ok).toBe(false);
        expect(result.issues.length).toBeGreaterThan(0);
        expect(result.issues.every((issue) => issue.code === 'CAPABILITY_UNSUPPORTED')).toBe(true);
      }
    });

    it('mixed schema under the production manifest reports capability issues without policy noise', () => {
      policyState.policy = 'operation-only';
      const result = evaluatePageSchemaCapabilities(mixedFlowSchema());
      expect(result.ok).toBe(false);
      expect(result.issues.every((issue) => issue.code === 'CAPABILITY_UNSUPPORTED')).toBe(true);
    });
  });
});
