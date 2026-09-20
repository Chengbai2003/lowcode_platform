import { describe, it, expect } from 'vitest';
import {
  DATA_SOURCE_EXECUTION_ERROR_CODES,
  isDataSourceExecutionErrorCode,
  validateDataSourceExecutionRequest,
  DEFAULT_SCHEMA_LIMITS,
} from '../index';

describe('DataSource execution host contract (M1b-1 PR B / ADR-0005)', () => {
  describe('error code registry', () => {
    it('freezes the exact execution error code set', () => {
      expect(Object.keys(DATA_SOURCE_EXECUTION_ERROR_CODES).sort()).toEqual([
        'CAPABILITY_DENIED',
        'EXECUTION_BUSY',
        'FORBIDDEN',
        'INVALID_PARAMS',
        'INVALID_RESULT',
        'TIMEOUT',
        'UNKNOWN_OPERATION',
        'UPSTREAM_FAILURE',
      ]);
      expect(Object.isFrozen(DATA_SOURCE_EXECUTION_ERROR_CODES)).toBe(true);
    });

    it('recognizes member codes and rejects everything else', () => {
      expect(isDataSourceExecutionErrorCode('TIMEOUT')).toBe(true);
      expect(isDataSourceExecutionErrorCode('SOMETHING_ELSE')).toBe(false);
      expect(isDataSourceExecutionErrorCode('toString')).toBe(false);
      expect(isDataSourceExecutionErrorCode(null)).toBe(false);
    });
  });

  describe('validateDataSourceExecutionRequest: 正向', () => {
    it('accepts a minimal request and rebuilds it from own fields only', () => {
      const result = validateDataSourceExecutionRequest({
        pageId: 'order-page',
        pageVersion: 3,
        sourceId: 'searchItems',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({
          pageId: 'order-page',
          pageVersion: 3,
          sourceId: 'searchItems',
        });
        expect(result.value.params).toBeUndefined();
      }
    });

    it('accepts evaluated params and returns the sanitized deep copy', () => {
      const incoming: { pageId: string; pageVersion: number; sourceId: string; params: object } = {
        pageId: 'p',
        pageVersion: 1,
        sourceId: 's',
        params: { query: 'apple', nested: { limit: 5, flags: [true, null] } },
      };
      const result = validateDataSourceExecutionRequest(incoming);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.params).toEqual({
          query: 'apple',
          nested: { limit: 5, flags: [true, null] },
        });
        // 返回的是剥离原型链的深拷贝，后续变异入参不影响结果
        incoming.params.query = 'mutated';
        expect(result.value.params?.query).toBe('apple');
      }
    });

    it('accepts an explicit empty params object', () => {
      const result = validateDataSourceExecutionRequest({
        pageId: 'p',
        pageVersion: 1,
        sourceId: 's',
        params: {},
      });
      expect(result.ok).toBe(true);
    });
  });

  describe('validateDataSourceExecutionRequest: 请求形状拒绝（全部 INVALID_PARAMS）', () => {
    it.each([
      ['null', null],
      ['array', [1, 2]],
      ['string', 'execute'],
      ['非普通对象原型', Object.create({ pageId: 'x' })],
    ])('rejects non-plain-object request: %s', (_label, value) => {
      const result = validateDataSourceExecutionRequest(value);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues).toHaveLength(1);
        expect(result.issues[0].code).toBe('INVALID_PARAMS');
      }
    });

    it('rejects unknown fields（url/token/risk 等越界字段落入同一拒绝）', () => {
      const result = validateDataSourceExecutionRequest({
        pageId: 'p',
        pageVersion: 1,
        sourceId: 's',
        url: 'http://evil.example.com',
        token: 'secret',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((i) => i.code === 'INVALID_PARAMS' && i.path[0] === 'url')).toBe(
          true,
        );
        expect(
          result.issues.some((i) => i.code === 'INVALID_PARAMS' && i.path[0] === 'token'),
        ).toBe(true);
      }
    });

    it.each([
      ['缺失 pageId', { pageVersion: 1, sourceId: 's' }],
      ['pageId 非字符串', { pageId: 42, pageVersion: 1, sourceId: 's' }],
      ['pageId 空串', { pageId: '   ', pageVersion: 1, sourceId: 's' }],
      ['pageId 超长', { pageId: 'a'.repeat(257), pageVersion: 1, sourceId: 's' }],
      ['缺失 pageVersion', { pageId: 'p', sourceId: 's' }],
      ['pageVersion 为 0', { pageId: 'p', pageVersion: 0, sourceId: 's' }],
      ['pageVersion 为负数', { pageId: 'p', pageVersion: -1, sourceId: 's' }],
      ['pageVersion 为小数', { pageId: 'p', pageVersion: 1.5, sourceId: 's' }],
      ['pageVersion 为字符串', { pageId: 'p', pageVersion: '1', sourceId: 's' }],
      ['缺失 sourceId', { pageId: 'p', pageVersion: 1 }],
      ['sourceId 非安全键（路径）', { pageId: 'p', pageVersion: 1, sourceId: 'a.b' }],
      ['sourceId 非安全键（保留字）', { pageId: 'p', pageVersion: 1, sourceId: '__proto__' }],
    ])('rejects %s', (_label, value) => {
      const result = validateDataSourceExecutionRequest(value);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.length).toBeGreaterThan(0);
        expect(result.issues.every((i) => i.code === 'INVALID_PARAMS')).toBe(true);
      }
    });

    it('rejects symbol and accessor properties on the request', () => {
      const request: Record<string, unknown> = { pageId: 'p', pageVersion: 1, sourceId: 's' };
      Object.defineProperty(request, 'injected', {
        get() {
          return 'getter';
        },
        enumerable: true,
        configurable: true,
      });
      const result = validateDataSourceExecutionRequest(request);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(
          result.issues.some(
            (i) => i.code === 'ACCESSOR_PROPERTY_FORBIDDEN' || i.code === 'INVALID_PARAMS',
          ),
        ).toBe(true);
      }
    });
  });

  describe('validateDataSourceExecutionRequest: params 拒绝（复用共享 JsonValue 预算）', () => {
    it('rejects params that is an array or a non-plain object', () => {
      for (const params of [[1, 2], 'str', 5, true]) {
        const result = validateDataSourceExecutionRequest({
          pageId: 'p',
          pageVersion: 1,
          sourceId: 's',
          params,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(
            result.issues.some((i) => i.code === 'INVALID_PARAMS' && i.path[0] === 'params'),
          ).toBe(true);
        }
      }
    });

    it('rejects unsafe param keys', () => {
      const result = validateDataSourceExecutionRequest({
        pageId: 'p',
        pageVersion: 1,
        sourceId: 's',
        params: { 'bad-key': 1, __proto__: 0 },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((i) => i.path[0] === 'params' && i.path[1] === 'bad-key')).toBe(
          true,
        );
      }
    });

    it('rejects param entries beyond the frozen budget', () => {
      const params: Record<string, number> = {};
      for (let i = 0; i < DEFAULT_SCHEMA_LIMITS.maxDataSourceParamEntries + 1; i += 1) {
        params[`k${i}`] = i;
      }
      const result = validateDataSourceExecutionRequest({
        pageId: 'p',
        pageVersion: 1,
        sourceId: 's',
        params,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(
          result.issues.some((i) => i.code === 'INVALID_PARAMS' && i.path[0] === 'params'),
        ).toBe(true);
      }
    });

    it('rejects non-JSON param values (function / NaN / deep nesting)', () => {
      const functionResult = validateDataSourceExecutionRequest({
        pageId: 'p',
        pageVersion: 1,
        sourceId: 's',
        params: { fn: () => 1 },
      });
      expect(functionResult.ok).toBe(false);

      const nanResult = validateDataSourceExecutionRequest({
        pageId: 'p',
        pageVersion: 1,
        sourceId: 's',
        params: { v: Number.NaN },
      });
      expect(nanResult.ok).toBe(false);

      let deep: unknown = 1;
      for (let i = 0; i < DEFAULT_SCHEMA_LIMITS.maxDepth + 2; i += 1) {
        deep = { nested: deep };
      }
      const deepResult = validateDataSourceExecutionRequest({
        pageId: 'p',
        pageVersion: 1,
        sourceId: 's',
        params: { deep },
      });
      expect(deepResult.ok).toBe(false);
      if (!deepResult.ok) {
        expect(deepResult.issues.some((i) => i.code === 'SCHEMA_DEPTH_EXCEEDED')).toBe(true);
      }
    });
  });
});
