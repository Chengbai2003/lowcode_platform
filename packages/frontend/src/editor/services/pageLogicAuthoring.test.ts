import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import React, { useEffect, useState } from 'react';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import type { PageSchema } from '../../types';
import {
  serializePageLogic,
  parseAndValidatePageLogic,
  parseAndValidateFullSchema,
} from './pageLogicAuthoring';
import { serializePageSchema } from './schemaSync';
import { useHistoryStore } from '../store/history';
import { useSchemaHistoryStore } from '../hooks/useSchemaHistoryStore';
import { PreviewPane } from '../components/layout/PreviewPane/PreviewPane';

let registeredSaveCommand: (() => void) | null = null;

vi.mock('@monaco-editor/react', () => {
  return {
    default: ({ value, onChange, onMount }: any) => {
      useEffect(() => {
        if (onMount) {
          const fakeEditor = {
            addCommand: (_keybinding: number, handler: () => void) => {
              registeredSaveCommand = handler;
            },
            deltaDecorations: vi.fn().mockReturnValue([]),
            onDidFocusEditorText: vi.fn().mockReturnValue({ dispose: vi.fn() }),
            revealLineInCenter: vi.fn(),
            getModel: vi.fn(),
          };
          const fakeMonaco = {
            KeyMod: { CtrlCmd: 2048 },
            KeyCode: { KeyS: 49 },
            Range: class {},
          };
          onMount(fakeEditor, fakeMonaco);
        }
      }, [onMount]);

      return React.createElement('textarea', {
        'data-testid': 'monaco-editor-textarea',
        value,
        onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => onChange?.(e.target.value),
        onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            registeredSaveCommand?.();
          }
        },
      });
    },
  };
});

vi.mock('../components/layout/PreviewPane/SelectableCanvas', () => ({
  SelectableCanvas: () => React.createElement('div', { 'data-testid': 'mock-selectable-canvas' }),
}));

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

interface ConformanceFixture {
  readonly corpusVersion: string;
  readonly reviewReason: string;
  readonly schema: PageSchema;
  readonly legacySchema: PageSchema;
  readonly expected: {
    readonly canonicalLogic: Record<string, unknown>;
  };
  readonly negativeCases: Record<
    string,
    {
      readonly schema: PageSchema;
      readonly expectedCode: string;
      readonly expectedPath: ReadonlyArray<string | number>;
    }
  >;
}

function loadConformanceFixture(): ConformanceFixture {
  const candidatePaths = [
    path.resolve(process.cwd(), '../../test-fixtures/m1a-page-logic-conformance.json'),
    path.resolve(process.cwd(), 'test-fixtures/m1a-page-logic-conformance.json'),
  ];
  for (const candidatePath of candidatePaths) {
    if (existsSync(candidatePath)) {
      return JSON.parse(readFileSync(candidatePath, 'utf8')) as ConformanceFixture;
    }
  }
  throw new Error('Unable to locate test-fixtures/m1a-page-logic-conformance.json');
}

const conformanceFixture = loadConformanceFixture();
const negativeCaseEntries = Object.entries(conformanceFixture.negativeCases);

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

  it('verifies Monaco Ctrl/Cmd+S triggers onSchemaCommit and error panel interactions in PreviewPane', () => {
    const onSchemaCommit = vi.fn();
    const allComponents = {
      Page: {} as any,
      Text: {} as any,
      Button: {} as any,
    };

    render(
      React.createElement(PreviewPane, {
        schema: baseSchema,
        preset: { components: {} } as any,
        pageId: 'page-1',
        documentSessionId: 'session-1',
        allComponents,
        eventContext: {},
        previewTheme: 'light',
        onSchemaCommit,
      }),
    );

    // 1. Switch to '页面逻辑' tab
    const logicTabBtn = screen.getByRole('button', { name: '页面逻辑' });
    fireEvent.click(logicTabBtn);

    const textarea = screen.getByTestId('monaco-editor-textarea') as HTMLTextAreaElement;
    expect(textarea.value).toContain('"count": 1');

    // 2. Edit logic to valid new content and trigger Ctrl+S
    fireEvent.change(textarea, {
      target: {
        value: JSON.stringify(
          {
            states: { count: 100 },
            computed: { doubleCount: 'state.count * 2' },
          },
          null,
          2,
        ),
      },
    });

    // Press Ctrl+S
    fireEvent.keyDown(textarea, { key: 's', ctrlKey: true });

    // Verify onSchemaCommit was called
    expect(onSchemaCommit).toHaveBeenCalledTimes(1);
    const committedSchema: PageSchema = onSchemaCommit.mock.calls[0][0];
    expect(committedSchema.logic?.states?.count).toBe(100);
    expect(committedSchema.logic?.computed?.doubleCount).toBe('state.count * 2');
    expect(screen.queryByTestId('schema-error-panel')).toBeNull();

    // 3. Edit logic to invalid content (missing state reference in computed)
    fireEvent.change(textarea, {
      target: {
        value: JSON.stringify(
          {
            states: { count: 100 },
            computed: { broken: 'state.nonExistent * 2' },
          },
          null,
          2,
        ),
      },
    });

    // Trigger Ctrl+S on invalid content
    fireEvent.keyDown(textarea, { key: 's', ctrlKey: true });

    // onSchemaCommit should not be called again
    expect(onSchemaCommit).toHaveBeenCalledTimes(1);

    // Error panel should be displayed with code, path, and message
    const errorPanel = screen.getByTestId('schema-error-panel');
    expect(errorPanel).toBeTruthy();

    const errorItem = screen.getByTestId('schema-error-item');
    expect(errorItem.textContent).toContain('COMPUTED_REFERENCE_MISSING');
    expect(errorItem.textContent).toContain('logic.computed.broken');

    // 4. Click error panel close button
    const closeBtn = screen.getByRole('button', { name: '关闭错误面板' });
    fireEvent.click(closeBtn);

    expect(screen.queryByTestId('schema-error-panel')).toBeNull();
  });

  it('preserves ordered ActionFlow steps and onError while rejecting a removed referenced flow', () => {
    const logic = {
      states: { count: 0 },
      flows: {
        save: {
          steps: [
            { type: 'setValue', field: 'state.count', value: 1 },
            { type: 'setValue', field: 'state.count', value: 2 },
          ],
          onError: [{ type: 'setValue', field: 'state.count', value: -1 }],
        },
      },
    };
    const accepted = parseAndValidatePageLogic(JSON.stringify(logic), baseSchema, whitelist);
    expect(accepted.success).toBe(true);
    if (!accepted.success) return;
    expect(accepted.data.logic?.flows?.save.steps).toEqual(logic.flows.save.steps);
    expect(accepted.data.logic?.flows?.save.onError).toEqual(logic.flows.save.onError);

    const referencedSchema: PageSchema = {
      ...accepted.data,
      components: {
        ...accepted.data.components,
        child: {
          ...accepted.data.components.child,
          events: { onClick: [{ type: 'runFlow', flow: 'save' }] },
        },
      },
    };
    const rejected = parseAndValidatePageLogic(
      JSON.stringify({ states: { count: 0 }, flows: {} }),
      referencedSchema,
      whitelist,
    );
    expect(rejected.success).toBe(false);
    if (rejected.success) return;
    expect(rejected.issues.some((issue) => issue.code === 'FLOW_REFERENCE_MISSING')).toBe(true);
  });
});

describe('M1a-3 / C2.1 Frontend validator conformance against unified fixture', () => {
  it('covers exactly 9 negative cases in the conformance fixture', () => {
    expect(negativeCaseEntries).toHaveLength(9);
  });

  it('returns canonical deep-frozen schema matching expected.canonicalLogic for main schema', () => {
    const result = parseAndValidateFullSchema(JSON.stringify(conformanceFixture.schema), whitelist);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(Object.isFrozen(result.data)).toBe(true);
    expect(Object.isFrozen(result.data.components)).toBe(true);
    expect(Object.isFrozen(result.data.components.root)).toBe(true);
    expect(Object.isFrozen(result.data.logic)).toBe(true);
    expect(Object.isFrozen(result.data.logic?.states)).toBe(true);
    expect(Object.isFrozen(result.data.logic?.computed)).toBe(true);
    expect(Object.isFrozen(result.data.logic?.flows)).toBe(true);
    expect(Object.isFrozen(result.data.logic?.flows?.submitOrder)).toBe(true);
    expect(Object.isFrozen(result.data.logic?.flows?.submitOrder?.steps)).toBe(true);
    expect(Object.isFrozen(result.data.logic?.flows?.submitOrder?.steps?.[0])).toBe(true);
    expect(result.data.logic).toEqual(conformanceFixture.expected.canonicalLogic);
  });

  it('accepts legacySchema without logic', () => {
    const result = parseAndValidateFullSchema(
      JSON.stringify(conformanceFixture.legacySchema),
      whitelist,
    );
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.schemaVersion).toBe(0);
    expect(Object.isFrozen(result.data)).toBe(true);
  });

  it.each(negativeCaseEntries)(
    'rejects negative case "%s" with exact expectedCode and expectedPath via parseAndValidateFullSchema',
    (_caseName, testCase) => {
      const fullResult = parseAndValidateFullSchema(JSON.stringify(testCase.schema), whitelist);
      expect(fullResult.success).toBe(false);
      if (fullResult.success) return;

      const matched = fullResult.issues.find((issue) => issue.code === testCase.expectedCode);
      expect(matched).toBeDefined();
      expect(matched?.path).toEqual(testCase.expectedPath);
    },
  );

  it.each(negativeCaseEntries)(
    'rejects negative case "%s" with exact expectedCode and expectedPath via parseAndValidatePageLogic',
    (_caseName, testCase) => {
      const cleanBaseSchema: PageSchema = {
        schemaVersion: 0,
        rootId: 'root',
        components: {
          root: { id: 'root', type: 'Page', childrenIds: [] },
        },
      };
      const snippetResult = parseAndValidatePageLogic(
        JSON.stringify(testCase.schema.logic ?? {}),
        cleanBaseSchema,
        whitelist,
      );
      expect(snippetResult.success).toBe(false);
      if (snippetResult.success) return;

      const matched = snippetResult.issues.find((issue) => issue.code === testCase.expectedCode);
      expect(matched).toBeDefined();
      expect(matched?.path).toEqual(testCase.expectedPath);
    },
  );
});
