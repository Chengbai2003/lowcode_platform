import { describe, it, expect, beforeEach } from 'vitest';
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
});
