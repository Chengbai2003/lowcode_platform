import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';
import type { A2UISchema } from '../../../types';
import { useSchemaHistoryStore } from '../useSchemaHistoryStore';
import { useHistoryStore } from '../../store/history';

const createSchema = (text: string): A2UISchema => ({
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
