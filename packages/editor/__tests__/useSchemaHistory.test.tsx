import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { useSchemaHistory } from '../src/hooks/useSchemaHistory';

describe('useSchemaHistory', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should initialize with correct state', () => {
    const { result } = renderHook(() => useSchemaHistory('initial'));
    expect(result.current.state).toBe('initial');
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('should debounced push new states', () => {
    const { result } = renderHook(() => useSchemaHistory('initial'));
    
    act(() => {
      result.current.push('state 1');
      result.current.push('state 2');
    });

    // Debounce means multiple quick pushes only create one history entry and update current state
    expect(result.current.state).toBe('state 2');
    expect(result.current.canUndo).toBe(false); // Because it debounced over the 'initial' push without creating past stack
    
    // Jump time to bypass debounce
    act(() => {
      vi.advanceTimersByTime(600);
      result.current.push('state 3');
    });

    expect(result.current.state).toBe('state 3');
    expect(result.current.canUndo).toBe(true);
    expect(result.current.historySize).toBe(1); // past contains 'state 2'
  });

  it('should forcePush immediately', () => {
    const { result } = renderHook(() => useSchemaHistory('initial'));
    
    act(() => {
      result.current.forcePush('force 1');
    });
    
    expect(result.current.state).toBe('force 1');
    expect(result.current.canUndo).toBe(true);
    expect(result.current.historySize).toBe(1);
  });

  it('should undo and redo correctly', () => {
    const { result } = renderHook(() => useSchemaHistory('initial'));
    
    act(() => {
      result.current.forcePush('state 1');
      result.current.forcePush('state 2');
    });

    expect(result.current.state).toBe('state 2');
    expect(result.current.canUndo).toBe(true);

    act(() => {
      result.current.undo();
    });

    expect(result.current.state).toBe('state 1');
    expect(result.current.canUndo).toBe(true); // can undo back to initial
    expect(result.current.canRedo).toBe(true); // can redo back to state 2
    
    act(() => {
      result.current.redo();
    });

    expect(result.current.state).toBe('state 2');
    expect(result.current.canRedo).toBe(false);
  });

  it('pushing should clear future redo stack', () => {
    const { result } = renderHook(() => useSchemaHistory('initial'));
    
    act(() => {
      result.current.forcePush('step 1');
      result.current.forcePush('step 2');
      result.current.undo(); // now at step 1
    });

    expect(result.current.canRedo).toBe(true);

    act(() => {
      result.current.forcePush('new step 2'); // branching off
    });

    expect(result.current.canRedo).toBe(false); // future is cleared
  });
});
