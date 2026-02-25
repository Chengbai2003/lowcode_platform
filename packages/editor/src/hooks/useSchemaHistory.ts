import { useState, useCallback, useRef } from "react";

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

export function useSchemaHistory<T>(initialState: T, maxHistory = 50) {
  const [history, setHistory] = useState<HistoryState<T>>({
    past: [],
    present: initialState,
    future: [],
  });

  const lastPushTime = useRef(0);
  const DEBOUNCE_MS = 500;

  const push = useCallback(
    (newState: T) => {
      const now = Date.now();
      setHistory((prev) => {
        if (now - lastPushTime.current < DEBOUNCE_MS) {
          return { ...prev, present: newState };
        }
        lastPushTime.current = now;
        const newPast = [...prev.past, prev.present].slice(-maxHistory);
        return { past: newPast, present: newState, future: [] };
      });
    },
    [maxHistory],
  );

  const forcePush = useCallback(
    (newState: T) => {
      lastPushTime.current = 0;
      setHistory((prev) => {
        const newPast = [...prev.past, prev.present].slice(-maxHistory);
        return { past: newPast, present: newState, future: [] };
      });
    },
    [maxHistory],
  );

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.past.length === 0) return prev;
      const previous = prev.past[prev.past.length - 1];
      const newPast = prev.past.slice(0, -1);
      return {
        past: newPast,
        present: previous,
        future: [prev.present, ...prev.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((prev) => {
      if (prev.future.length === 0) return prev;
      const next = prev.future[0];
      const newFuture = prev.future.slice(1);
      return {
        past: [...prev.past, prev.present],
        present: next,
        future: newFuture,
      };
    });
  }, []);

  return {
    state: history.present,
    push,
    forcePush,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    historySize: history.past.length,
  };
}
