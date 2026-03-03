import { useState, useCallback } from "react";

export interface SchemaHistoryState {
  past: string[];
  present: string;
  future: string[];
}

export const useSchemaHistory = (
  initialState: string,
  capacity: number = 50,
) => {
  const [history, setHistory] = useState<SchemaHistoryState>({
    past: [],
    present: initialState,
    future: [],
  });

  const push = useCallback(
    (value: string) => {
      setHistory((prev) => {
        // 防止重复值进入历史记录
        if (prev.present === value) {
          return prev;
        }

        // 如果当前值与present不同，则更新
        const newPast = [...prev.past, prev.present];

        // 控制历史记录长度
        if (newPast.length > capacity) {
          newPast.shift(); // 移除最老的历史记录
        }

        return {
          past: newPast,
          present: value,
          future: [], // 每次push后清空未来记录
        };
      });
    },
    [capacity],
  );

  const forcePush = useCallback((value: string) => {
    setHistory((prev) => ({
      ...prev,
      present: value,
      future: [],
    }));
  }, []);

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.past.length === 0) return prev;

      const previous = prev.past[prev.past.length - 1];
      const newPast = prev.past.slice(0, prev.past.length - 1);

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
    ...history,
    push,
    forcePush,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    historySize: history.past.length,
  };
};
