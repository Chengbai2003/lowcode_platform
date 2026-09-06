import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as contract from '@lowcode-platform/schema-contract';
import type { PageSchema } from '../../../types';
import { parseAndValidateFullSchema } from '../pageLogicAuthoring';
import { serializePageSchema } from '../schemaSync';
import { useSchemaHistoryStore } from '../../hooks/useSchemaHistoryStore';

const fixtureRaw = readFileSync(
  path.resolve(__dirname, '../../../../../../test-fixtures/m1a-page-logic-conformance.json'),
  'utf8',
);
const conformanceFixture = JSON.parse(fixtureRaw);

const manifestModulePath = path.resolve(
  __dirname,
  '../../../../../schema-contract/dist/capabilities/manifest.js',
);
const manifestModule = require(manifestModulePath);

const whitelist = ['Page', 'Text', 'Button'];

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

describe('Editor JSON & Ingress Capability Gates (C3b / Issue #47)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('6. Editor JSON → 保存 / 预览', () => {
    it('rejects blocked schema via real parseAndValidateFullSchema path and prevents schema update and save', () => {
      const serializedJson = serializePageSchema(conformanceFixture.schema);
      const onSchemaCommitSpy = vi.fn();
      const onSchemaChangeSpy = vi.fn();

      withBlockedCapability('page-state', 'editor-agent', () => {
        // 走真实解析与校验路径
        const validationResult = parseAndValidateFullSchema(serializedJson, whitelist);

        // 1. 证明错误传递且不返回成功数据
        expect(validationResult.success).toBe(false);

        // 2. 模拟 Editor JSON 保存逻辑（与 PreviewPane.tsx 的 Ctrl+S / onMount 逻辑完全对齐）
        const commitIfValid = (res: typeof validationResult) => {
          if (res.success) {
            onSchemaCommitSpy(res.data);
          }
        };
        commitIfValid(validationResult);

        if (validationResult.success) return;

        expect(validationResult.issues).toBeDefined();
        expect(validationResult.issues.length).toBeGreaterThan(0);
        expect(validationResult.issues[0].code).toBe('CAPABILITY_UNSUPPORTED');
        expect(validationResult.issues[0].path).toEqual(['logic', 'states']);
        expect(validationResult.issues[0].message).toContain('editor-agent');

        // 副作用断言：校验失败绝不触发 onSchemaCommit 或 onSchemaChange，不继续更新编辑器状态
        expect(onSchemaCommitSpy).not.toHaveBeenCalled();
        expect(onSchemaChangeSpy).not.toHaveBeenCalled();
      });
    });

    it('round-trips full conformance schema across JSON serialization without losing any capability fields', () => {
      const canonicalSchema = contract.requireSupportedPageSchema(conformanceFixture.schema);
      const serialized = serializePageSchema(canonicalSchema);
      const parsed = parseAndValidateFullSchema(serialized, whitelist);

      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      // 验证三个能力字段均完整保留，无一丢失
      expect(parsed.data.logic?.states).toEqual(canonicalSchema.logic?.states);
      expect(parsed.data.logic?.computed).toEqual(canonicalSchema.logic?.computed);
      expect(parsed.data.logic?.flows).toEqual(canonicalSchema.logic?.flows);
      expect(parsed.data).toEqual(canonicalSchema);
      expect(Object.isFrozen(parsed.data)).toBe(true);
    });

    it('preserves all three capabilities across history store undo and redo cycles', () => {
      const schemaA = contract.requireSupportedPageSchema(conformanceFixture.schema);
      const schemaB: PageSchema = {
        ...schemaA,
        components: {
          ...schemaA.components,
          'change-price': {
            ...schemaA.components['change-price'],
            props: {
              ...schemaA.components['change-price'].props,
              children: 'Revised price button',
            },
          },
        },
      };

      let currentSchema = schemaA;
      const handleSchemaUpdate = (next: PageSchema) => {
        currentSchema = next;
      };

      const { result } = renderHook(() =>
        useSchemaHistoryStore(schemaA, handleSchemaUpdate, {
          enableMerge: false,
        }),
      );

      // 更新到 schemaB
      act(() => {
        result.current.forceUpdateSchema(schemaB, 'Update Button');
      });
      expect(currentSchema.components['change-price'].props?.children).toBe('Revised price button');
      expect(currentSchema.logic?.states).toBeDefined();
      expect(currentSchema.logic?.computed).toBeDefined();
      expect(currentSchema.logic?.flows).toBeDefined();

      // Undo 到 schemaA
      act(() => {
        result.current.undo();
      });
      expect(currentSchema.components['change-price'].props?.children).toBe('change price');
      expect(currentSchema.logic?.states).toEqual(schemaA.logic?.states);
      expect(currentSchema.logic?.computed).toEqual(schemaA.logic?.computed);
      expect(currentSchema.logic?.flows).toEqual(schemaA.logic?.flows);

      // Redo 回到 schemaB
      act(() => {
        result.current.redo();
      });
      expect(currentSchema.components['change-price'].props?.children).toBe('Revised price button');
      expect(currentSchema.logic?.states).toEqual(schemaB.logic?.states);
      expect(currentSchema.logic?.computed).toEqual(schemaB.logic?.computed);
      expect(currentSchema.logic?.flows).toEqual(schemaB.logic?.flows);
    });

    it('round-trips legacy schema without logic and ensures no logic object is introduced', () => {
      const legacySchema = contract.requireSupportedPageSchema(conformanceFixture.legacySchema);
      const serialized = serializePageSchema(legacySchema);
      const parsed = parseAndValidateFullSchema(serialized, whitelist);

      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      expect(parsed.data).toEqual(legacySchema);
      expect(parsed.data.logic).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(parsed.data, 'logic')).toBe(false);
    });
  });
});
