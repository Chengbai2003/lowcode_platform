import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';
import { requireSupportedPageSchema } from '@lowcode-platform/schema-contract';
import type { ComponentNode, PageSchema } from '../../../types';
import type { EditorPatchOperation } from '../../types/patch';
import { createPatchCommand } from '../../commands/schemaCommands';
import { useSchemaHistoryStore } from '../useSchemaHistoryStore';
import { useHistoryStore } from '../../store/history';

const createSchema = (text: string): PageSchema => ({
  schemaVersion: 0,
  rootId: 'root',
  components: {
    root: {
      id: 'root',
      type: 'Div',
      props: {
        text,
      },
      childrenIds: [],
    },
  },
});

describe('useSchemaHistoryStore', () => {
  beforeEach(() => {
    useHistoryStore.getState().clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows undo after property change and JSON save', () => {
    const initialSchema = createSchema('initial');

    const { result } = renderHook(() => {
      const [schema, setSchema] = useState(initialSchema);
      const history = useSchemaHistoryStore(schema, setSchema, { enableMerge: false });
      return { schema, ...history };
    });

    act(() => {
      result.current.updateSchema(createSchema('updated'), '属性变更');
    });

    act(() => {
      result.current.forceUpdateSchema(createSchema('saved'), '保存 JSON');
    });

    expect(useHistoryStore.getState().canUndo()).toBe(true);

    act(() => {
      result.current.undo();
    });

    expect(result.current.schema.components.root.props?.text).toBe('updated');
  });

  it('updates schema immediately while deferring merged history entry', async () => {
    vi.useFakeTimers();

    const initialSchema = createSchema('initial');

    const { result } = renderHook(() => {
      const [schema, setSchema] = useState(initialSchema);
      const history = useSchemaHistoryStore(schema, setSchema, {
        enableMerge: true,
        mergeWindow: 500,
      });
      return { schema, ...history };
    });

    act(() => {
      result.current.updateSchema(createSchema('123'), '属性变更');
    });

    expect(result.current.schema.components.root.props?.text).toBe('123');
    expect(result.current.canUndo).toBe(true);
    expect(result.current.undoStackSize).toBe(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(result.current.undoStackSize).toBe(1);
  });

  it('merges rapid updates into one undo step', async () => {
    vi.useFakeTimers();

    const initialSchema = createSchema('initial');

    const { result } = renderHook(() => {
      const [schema, setSchema] = useState(initialSchema);
      const history = useSchemaHistoryStore(schema, setSchema, {
        enableMerge: true,
        mergeWindow: 500,
      });
      return { schema, ...history };
    });

    act(() => {
      result.current.updateSchema(createSchema('1'), '属性变更');
    });

    act(() => {
      result.current.updateSchema(createSchema('12'), '属性变更');
    });

    act(() => {
      result.current.updateSchema(createSchema('123456'), '属性变更');
    });

    expect(result.current.schema.components.root.props?.text).toBe('123456');
    expect(result.current.undoStackSize).toBe(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(result.current.undoStackSize).toBe(1);

    act(() => {
      result.current.undo();
    });

    expect(result.current.schema.components.root.props?.text).toBe('initial');

    act(() => {
      result.current.redo();
    });

    expect(result.current.schema.components.root.props?.text).toBe('123456');
  });

  it('flushes pending merge before force update', async () => {
    vi.useFakeTimers();

    const initialSchema = createSchema('initial');

    const { result } = renderHook(() => {
      const [schema, setSchema] = useState(initialSchema);
      const history = useSchemaHistoryStore(schema, setSchema, {
        enableMerge: true,
        mergeWindow: 500,
      });
      return { schema, ...history };
    });

    act(() => {
      result.current.updateSchema(createSchema('draft'), '属性变更');
    });

    expect(result.current.undoStackSize).toBe(0);

    act(() => {
      result.current.forceUpdateSchema(createSchema('saved'), '保存 JSON');
    });

    expect(result.current.schema.components.root.props?.text).toBe('saved');
    expect(result.current.undoStackSize).toBe(2);

    act(() => {
      result.current.undo();
    });

    expect(result.current.schema.components.root.props?.text).toBe('draft');

    act(() => {
      result.current.undo();
    });

    expect(result.current.schema.components.root.props?.text).toBe('initial');

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
  });
});

interface ConformanceFixture {
  readonly corpusVersion: string;
  readonly reviewReason: string;
  readonly schema: PageSchema;
  readonly legacySchema: PageSchema;
  readonly expected: {
    readonly canonicalLogic: Record<string, unknown>;
  };
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

/**
 * Normalizes representation ONLY for confirmed empty optional fields:
 * - props: {} -> undefined when empty
 * - events: {} -> undefined when empty
 * - childrenIds: [] -> undefined when empty
 * Existing applyPatchToSchema initializes empty optional props/events/childrenIds.
 * Explicitly preserves all logic, non-empty props, non-empty events, and non-empty children.
 */
function normalizeEmptyOptionalFields(schema: PageSchema): PageSchema {
  const components: Record<string, ComponentNode> = {};
  for (const [id, comp] of Object.entries(schema.components)) {
    const hasProps = comp.props !== undefined && Object.keys(comp.props).length > 0;
    const hasEvents = comp.events !== undefined && Object.keys(comp.events).length > 0;
    const hasChildren = comp.childrenIds !== undefined && comp.childrenIds.length > 0;
    components[id] = {
      id: comp.id,
      type: comp.type,
      ...(hasProps ? { props: comp.props } : {}),
      ...(hasChildren ? { childrenIds: comp.childrenIds } : {}),
      ...(hasEvents ? { events: comp.events } : {}),
    };
  }
  return {
    schemaVersion: schema.schemaVersion,
    rootId: schema.rootId,
    components,
    ...(schema.logic ? { logic: schema.logic } : {}),
  };
}

describe('M1a-3 / C2.2 Editor history round-trip conformance', () => {
  function createConformanceCandidates() {
    const schemaA = requireSupportedPageSchema(conformanceFixture.schema);
    const candidateB: PageSchema = {
      ...schemaA,
      components: {
        ...schemaA.components,
        submit: {
          ...schemaA.components.submit,
          props: {
            ...schemaA.components.submit.props,
            children: 'Submit revised',
          },
        },
      },
    };
    const schemaB = requireSupportedPageSchema(candidateB);

    const candidateC: PageSchema = {
      ...schemaB,
      logic: {
        ...schemaB.logic!,
        states: {
          ...schemaB.logic!.states,
          price: 7,
        },
      },
    };
    const schemaC = requireSupportedPageSchema(candidateC);

    const legacySchema = requireSupportedPageSchema(conformanceFixture.legacySchema);

    return { schemaA, schemaB, schemaC, legacySchema };
  }

  beforeEach(() => {
    useHistoryStore.getState().clear();
  });

  afterEach(() => {
    useHistoryStore.getState().clear();
  });

  it('executes real patch commands through useSchemaHistoryStore: A -> B -> C -> Undo B -> Undo A -> Redo B -> Redo C', () => {
    const { schemaA, schemaB, schemaC } = createConformanceCandidates();

    const { result, unmount } = renderHook(() => {
      const [schema, setSchema] = useState<PageSchema>(schemaA);
      const history = useSchemaHistoryStore(schema, setSchema, { enableMerge: false });
      return { schema, setSchema, ...history };
    });

    try {
      // Checkpoint 0: Initial (A)
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
      expect(result.current.schema.logic).toEqual(conformanceFixture.expected.canonicalLogic);
      expect(result.current.schema.components.submit.props?.children).toBe('Submit');

      // 1. A -> B via createPatchCommand
      act(() => {
        const patchB: readonly EditorPatchOperation[] = [
          { op: 'updateProps', componentId: 'submit', props: { children: 'Submit revised' } },
        ];
        const cmdB = createPatchCommand(
          result.current.schema,
          patchB,
          result.current.setSchema,
          'Patch submit children',
        );
        result.current.executeSchemaCommand(cmdB);
      });

      // Checkpoint 1: B
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);
      expect(normalizeEmptyOptionalFields(result.current.schema)).toEqual(
        normalizeEmptyOptionalFields(schemaB),
      );
      expect(result.current.schema.logic).toEqual(conformanceFixture.expected.canonicalLogic);
      expect(result.current.schema.components.submit.props?.children).toBe('Submit revised');

      // 2. B -> C via createPatchCommand
      act(() => {
        const patchC: readonly EditorPatchOperation[] = [
          { op: 'replacePageLogic', logic: schemaC.logic as unknown as Record<string, unknown> },
        ];
        const cmdC = createPatchCommand(
          result.current.schema,
          patchC,
          result.current.setSchema,
          'Patch logic price to 7',
        );
        result.current.executeSchemaCommand(cmdC);
      });

      // Checkpoint 2: C
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);
      expect(result.current.schema.logic?.states?.price).toBe(7);
      expect(normalizeEmptyOptionalFields(result.current.schema)).toEqual(
        normalizeEmptyOptionalFields(schemaC),
      );
      expect(result.current.schema.components.submit.props?.children).toBe('Submit revised');

      // 3. Undo: C -> B
      act(() => {
        result.current.undo();
      });

      // Checkpoint 3: Undo to B
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(true);
      expect(normalizeEmptyOptionalFields(result.current.schema)).toEqual(
        normalizeEmptyOptionalFields(schemaB),
      );
      expect(result.current.schema.logic).toEqual(conformanceFixture.expected.canonicalLogic);
      expect(result.current.schema.components.submit.props?.children).toBe('Submit revised');

      // 4. Undo: B -> A
      act(() => {
        result.current.undo();
      });

      // Checkpoint 4: Undo to A
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(true);
      expect(normalizeEmptyOptionalFields(result.current.schema)).toEqual(
        normalizeEmptyOptionalFields(schemaA),
      );
      expect(result.current.schema.logic).toEqual(conformanceFixture.expected.canonicalLogic);
      expect(result.current.schema.components.submit.props?.children).toBe('Submit');

      // 5. Redo: A -> B
      act(() => {
        result.current.redo();
      });

      // Checkpoint 5: Redo to B
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(true);
      expect(normalizeEmptyOptionalFields(result.current.schema)).toEqual(
        normalizeEmptyOptionalFields(schemaB),
      );
      expect(result.current.schema.logic).toEqual(conformanceFixture.expected.canonicalLogic);
      expect(result.current.schema.components.submit.props?.children).toBe('Submit revised');

      // 6. Redo: B -> C
      act(() => {
        result.current.redo();
      });

      // Checkpoint 6: Redo to C
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);
      expect(result.current.schema.logic?.states?.price).toBe(7);
      expect(normalizeEmptyOptionalFields(result.current.schema)).toEqual(
        normalizeEmptyOptionalFields(schemaC),
      );
      expect(result.current.schema.components.submit.props?.children).toBe('Submit revised');
    } finally {
      unmount();
      useHistoryStore.getState().clear();
    }
  });
});
