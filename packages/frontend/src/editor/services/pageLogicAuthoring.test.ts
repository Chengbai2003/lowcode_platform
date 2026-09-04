import { describe, expect, it } from 'vitest';
import type { PageSchema } from '../../types';
import {
  serializePageLogic,
  parseAndValidatePageLogic,
  parseAndValidateFullSchema,
} from './pageLogicAuthoring';
import { serializePageSchema } from './schemaSync';
import { useHistoryStore } from '../store/history';
import { useSchemaHistoryStore } from '../hooks/useSchemaHistoryStore';
import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';

const whitelist = ['Page', 'Text', 'Button'];

const baseSchema: PageSchema = {
  schemaVersion: 0,
  rootId: 'root',
  logic: {
    states: { count: 1, text: 'hello' },
    computed: { doubleCount: 'state.count * 2' },
  },
  components: {
    root: { id: 'root', type: 'Page', childrenIds: ['child'] },
    child: { id: 'child', type: 'Text', props: { children: 'test' } },
  },
};

describe('pageLogicAuthoring', () => {
  it('serializes only the current logic, and outputs {} when no logic is present', () => {
    expect(serializePageLogic(baseSchema.logic)).toBe(JSON.stringify(baseSchema.logic, null, 2));

    expect(serializePageLogic(undefined)).toBe('{}');
    expect(serializePageLogic(null)).toBe('{}');
    expect(serializePageLogic({})).toBe('{}');
  });

  it('combines valid snippet into canonical full schema without losing components or unedited declarations', () => {
    const snippet = JSON.stringify({
      states: { count: 2, text: 'hello' },
      computed: {
        doubleCount: 'state.count * 2',
        quadCount: 'computed.doubleCount * 2',
      },
    });

    const result = parseAndValidatePageLogic(snippet, baseSchema, whitelist);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.schemaVersion).toBe(0);
    expect(result.data.rootId).toBe('root');
    expect(result.data.components).toEqual(baseSchema.components);
    expect(result.data.logic?.states).toEqual({ count: 2, text: 'hello' });
    expect(result.data.logic?.computed).toEqual({
      doubleCount: 'state.count * 2',
      quadCount: 'computed.doubleCount * 2',
    });
    // Ensure deep frozen / canonical
    expect(Object.isFrozen(result.data)).toBe(true);
    expect(Object.isFrozen(result.data.logic)).toBe(true);
  });

  it('allows logic: {} to clear declarations', () => {
    const snippet = '{}';
    const result = parseAndValidatePageLogic(snippet, baseSchema, whitelist);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.logic?.states).toBeUndefined();
    expect(result.data.logic?.computed).toBeUndefined();
    expect(result.data.components).toEqual(baseSchema.components);
  });

  it('returns structured code/path/message for JSON parse errors on logic snippet', () => {
    const invalidJson = '{ states: { count: 1 } '; // syntax error
    const result = parseAndValidatePageLogic(invalidJson, baseSchema, whitelist);
    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.issues).toHaveLength(1);
    const issue = result.issues[0];
    expect(issue.code).toBe('JSON_PARSE_ERROR');
    expect(issue.path).toEqual(['logic']);
    expect(typeof issue.message).toBe('string');
  });

  it('returns structured code/path/message for Contract errors (missing reference, cycle, invalid expression)', () => {
    // 1. Missing reference
    const missingRefSnippet = JSON.stringify({
      states: { count: 1 },
      computed: { double: 'state.unknownState * 2' },
    });
    const missingResult = parseAndValidatePageLogic(missingRefSnippet, baseSchema, whitelist);
    expect(missingResult.success).toBe(false);
    if (!missingResult.success) {
      expect(missingResult.issues[0].code).toBe('COMPUTED_REFERENCE_MISSING');
      expect(missingResult.issues[0].path).toEqual(['logic', 'computed', 'double']);
    }

    // 2. Cycle
    const cycleSnippet = JSON.stringify({
      computed: {
        a: 'computed.b + 1',
        b: 'computed.a + 1',
      },
    });
    const cycleResult = parseAndValidatePageLogic(cycleSnippet, baseSchema, whitelist);
    expect(cycleResult.success).toBe(false);
    if (!cycleResult.success) {
      expect(cycleResult.issues[0].code).toBe('COMPUTED_CYCLE');
      expect(cycleResult.issues[0].path).toEqual(['logic', 'computed']);
    }

    // 3. Illegal expression syntax
    const invalidExprSnippet = JSON.stringify({
      computed: {
        a: '1 +',
      },
    });
    const exprResult = parseAndValidatePageLogic(invalidExprSnippet, baseSchema, whitelist);
    expect(exprResult.success).toBe(false);
    if (!exprResult.success) {
      expect(exprResult.issues[0].code).toBe('COMPUTED_EXPRESSION_PARSE_ERROR');
      expect(exprResult.issues[0].path).toEqual(['logic', 'computed', 'a']);
    }
  });

  it('records undo/redo command on onSchemaCommit and restores previous logic', () => {
    useHistoryStore.getState().clear();

    const { result } = renderHook(() => {
      const [schema, setSchema] = useState(baseSchema);
      const history = useSchemaHistoryStore(schema, setSchema, { enableMerge: false });
      return { schema, ...history };
    });

    const snippet = JSON.stringify({
      states: { count: 99 },
      computed: {},
    });
    const validation = parseAndValidatePageLogic(snippet, result.current.schema, whitelist);
    expect(validation.success).toBe(true);
    if (!validation.success) return;

    // Simulate onSchemaCommit (forceUpdateSchema)
    act(() => {
      result.current.forceUpdateSchema(validation.data, '保存页面逻辑');
    });

    expect(result.current.schema.logic?.states?.count).toBe(99);
    expect(useHistoryStore.getState().canUndo()).toBe(true);

    // Undo restores previous logic
    act(() => {
      result.current.undo();
    });

    expect(result.current.schema.logic?.states?.count).toBe(1);
    expect(result.current.schema.logic?.computed?.doubleCount).toBe('state.count * 2');

    // Redo restores new logic
    act(() => {
      result.current.redo();
    });
    expect(result.current.schema.logic?.states?.count).toBe(99);
  });

  it('ensures full JSON editor round-trips logic properly', () => {
    const serialized = serializePageSchema(baseSchema);
    expect(serialized).toContain('"states"');
    expect(serialized).toContain('"computed"');

    const result = parseAndValidateFullSchema(serialized, whitelist);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.logic).toEqual(baseSchema.logic);
    expect(result.data.components).toEqual(baseSchema.components);
  });
});
