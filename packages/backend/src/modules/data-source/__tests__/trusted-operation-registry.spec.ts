import {
  findTrustedOperation,
  listTrustedOperationSummaries,
  type TrustedOperationDefinition,
} from '../trusted-operation-registry';
import { resolveUpstreamTarget, EMPTY_UPSTREAM_TARGETS } from '../upstream-targets.provider';

describe('Trusted operation registry (M1b-1 PR B)', () => {
  const demo = findTrustedOperation('demo.items.search', '1');

  it('registers exactly one read-only demo operation with exact revision', () => {
    expect(demo).toBeDefined();
    const summaries = listTrustedOperationSummaries();
    expect(summaries).toHaveLength(1);
    expect(summaries[0].operationId).toBe('demo.items.search');
    expect(summaries[0].revision).toBe('1');
    expect(summaries[0].kind).toBe('readonly-query');
    // 公开目录不携带目标地址或权限细节
    // 公开目录不携带目标地址或权限细节（PR D 起增结构化 paramsContract）
    expect(Object.keys(summaries[0]).sort()).toEqual([
      'description',
      'kind',
      'operationId',
      'paramsContract',
      'revision',
      'title',
    ]);
  });

  it('never matches floating or inexact revisions', () => {
    expect(findTrustedOperation('demo.items.search', 'latest')).toBeUndefined();
    expect(findTrustedOperation('demo.items.search', '*')).toBeUndefined();
    expect(findTrustedOperation('demo.items.search', '2')).toBeUndefined();
    expect(findTrustedOperation('demo.items.search.v2', '1')).toBeUndefined();
    expect(findTrustedOperation('demo.items.search', '')).toBeUndefined();
  });

  describe('demo.items.search input contract', () => {
    it('accepts query/limit within bounds', () => {
      expect(demo?.validateParams({}).issues).toHaveLength(0);
      expect(demo?.validateParams({ query: 'apple' }).issues).toHaveLength(0);
      expect(demo?.validateParams({ limit: 50 }).issues).toHaveLength(0);
      expect(demo?.validateParams({ query: 'a'.repeat(128), limit: 1 }).issues).toHaveLength(0);
    });

    it.each([
      ['未知键（安全范围走私）', { tenantId: 'x' }],
      ['query 非字符串', { query: 1 }],
      ['query 超长', { query: 'a'.repeat(129) }],
      ['limit 下界', { limit: 0 }],
      ['limit 上界', { limit: 51 }],
      ['limit 小数', { limit: 1.5 }],
      ['limit 字符串', { limit: '5' }],
    ])('rejects %s', (_label, params) => {
      const result = demo?.validateParams(
        params as unknown as Record<string, import('@lowcode-platform/schema-contract').JsonValue>,
      );
      expect(result?.issues.length).toBeGreaterThan(0);
    });
  });

  describe('demo.items.search output contract', () => {
    it('accepts a well-formed result', () => {
      const result = demo?.validateOutput({
        items: [
          { id: 'a', title: 'Apple' },
          { id: 'b', title: 'Banana', price: 3 },
        ],
      });
      expect(result?.issues).toHaveLength(0);
    });

    it.each([
      ['非对象', 'oops'],
      ['items 非数组', { items: {} }],
      ['未知结果字段', { items: [], total: 3 }],
      ['未知条目字段', { items: [{ id: 'a', title: 't', extra: 1 }] }],
      ['id 非字符串', { items: [{ id: 1, title: 't' }] }],
      ['id 空串', { items: [{ id: '', title: 't' }] }],
      ['title 非字符串', { items: [{ id: 'a', title: 5 }] }],
      ['price 负数', { items: [{ id: 'a', title: 't', price: -1 }] }],
      ['price 非数字', { items: [{ id: 'a', title: 't', price: '3' }] }],
      ['超记录数', { items: Array.from({ length: 101 }, (_, i) => ({ id: `i${i}`, title: 't' })) }],
    ])('rejects %s', (_label, value) => {
      const result = demo?.validateOutput(value);
      expect(result?.issues.length).toBeGreaterThan(0);
    });
  });

  describe('upstream target resolution', () => {
    const loopbackTarget = { 'demo.items.search@1': 'http://127.0.0.1:9377/demo/items/search' };

    it('resolves nothing without trusted bindings (default deployment)', () => {
      expect(
        resolveUpstreamTarget(demo as TrustedOperationDefinition, EMPTY_UPSTREAM_TARGETS),
      ).toBeUndefined();
      expect(
        resolveUpstreamTarget(demo as TrustedOperationDefinition, {
          'demo.items.search@1': '   ',
        }),
      ).toBeUndefined();
    });

    it.each([
      ['公网 IPv4', 'http://10.0.0.1/demo/items/search'],
      ['公网域名', 'https://api.example.com/demo/items/search'],
      ['地址解析失败', 'not a url'],
      ['非 http(s) 协议', 'ftp://127.0.0.1/demo/items/search'],
    ])('refuses non-loopback or invalid targets: %s', (_label, raw) => {
      expect(
        resolveUpstreamTarget(demo as TrustedOperationDefinition, {
          'demo.items.search@1': raw,
        }),
      ).toBeUndefined();
    });

    it.each([
      ['127.0.0.1', 'http://127.0.0.1:9377/demo/items/search'],
      ['127.0.0.8（127/8 段）', 'http://127.0.0.8:9377/demo/items/search'],
      ['localhost', 'http://localhost:9377/demo/items/search'],
      ['大写主机名（URL 规范化后仍为回环）', 'http://LOCALHOST:9377/demo/items/search'],
      ['::1', 'http://[::1]:9377/demo/items/search'],
    ])('resolves loopback targets: %s', (_label, raw) => {
      const resolved = resolveUpstreamTarget(demo as TrustedOperationDefinition, {
        'demo.items.search@1': raw,
      });
      expect(resolved).toBeInstanceOf(URL);
    });

    it('keeps the configured path and query intact', () => {
      const resolved = resolveUpstreamTarget(demo as TrustedOperationDefinition, loopbackTarget);
      expect(resolved?.pathname).toBe('/demo/items/search');
    });

    it('ignores bindings for other operation keys', () => {
      expect(
        resolveUpstreamTarget(demo as TrustedOperationDefinition, {
          'demo.items.search@2': 'http://127.0.0.1:9377/demo/items/search',
          'other.op@1': 'http://127.0.0.1:9377/other',
        }),
      ).toBeUndefined();
    });
  });
});
