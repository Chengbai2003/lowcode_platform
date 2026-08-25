import { useCallback, useEffect, useRef } from 'react';

const STREAM_REVEAL_INTERVAL_MS = 40;
const STREAM_REVEAL_CHARS_PER_TICK = 24;

type UpdateAssistantMessage = (messageId: string, updater: (msg: any) => any) => void;

/**
 * Stream reveal hook — isolates pendingStreamChunks / timers for AI streaming.
 * Keeps 40ms interval reveal and pending queue out of the main chat hook.
 */
export function useAIAssistantStream(
  updateAssistantMessage: UpdateAssistantMessage,
  pageId?: string,
) {
  const pendingStreamChunksRef = useRef<Map<string, string>>(new Map());
  const streamRevealTimersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  const clearStreamReveal = useCallback((messageId: string) => {
    const timer = streamRevealTimersRef.current.get(messageId);
    if (timer) {
      clearInterval(timer);
      streamRevealTimersRef.current.delete(messageId);
    }
  }, []);

  const flushStreamContent = useCallback(
    (messageId: string) => {
      const pending = pendingStreamChunksRef.current.get(messageId);
      if (!pending) {
        clearStreamReveal(messageId);
        return;
      }
      pendingStreamChunksRef.current.delete(messageId);
      clearStreamReveal(messageId);
      updateAssistantMessage(messageId, (messageItem) => ({
        ...messageItem,
        content: `${(messageItem as { content: string }).content}${pending}`,
      }));
    },
    [clearStreamReveal, updateAssistantMessage],
  );

  const ensureStreamReveal = useCallback(
    (messageId: string) => {
      if (streamRevealTimersRef.current.has(messageId)) return;
      const timer = setInterval(() => {
        const pending = pendingStreamChunksRef.current.get(messageId) ?? '';
        if (!pending) {
          clearStreamReveal(messageId);
          return;
        }
        const chunk = pending.slice(0, STREAM_REVEAL_CHARS_PER_TICK);
        const rest = pending.slice(STREAM_REVEAL_CHARS_PER_TICK);
        if (rest) pendingStreamChunksRef.current.set(messageId, rest);
        else {
          pendingStreamChunksRef.current.delete(messageId);
          clearStreamReveal(messageId);
        }
        updateAssistantMessage(messageId, (messageItem) => ({
          ...messageItem,
          content: `${(messageItem as { content: string }).content}${chunk}`,
        }));
      }, STREAM_REVEAL_INTERVAL_MS);
      streamRevealTimersRef.current.set(messageId, timer);
    },
    [clearStreamReveal, updateAssistantMessage],
  );

  const enqueueStreamContent = useCallback(
    (messageId: string, delta: string) => {
      if (!delta) return;
      const existing = pendingStreamChunksRef.current.get(messageId) ?? '';
      pendingStreamChunksRef.current.set(messageId, `${existing}${delta}`);
      ensureStreamReveal(messageId);
    },
    [ensureStreamReveal],
  );

  const deletePending = useCallback((messageId: string) => {
    pendingStreamChunksRef.current.delete(messageId);
  }, []);

  const clearAll = useCallback(() => {
    streamRevealTimersRef.current.forEach((t) => clearInterval(t));
    streamRevealTimersRef.current.clear();
    pendingStreamChunksRef.current.clear();
  }, []);

  // pageId 变化时清理（跨页隔离）
  useEffect(() => {
    clearAll();
  }, [pageId, clearAll]);

  // unmount cleanup
  useEffect(
    () => () => {
      streamRevealTimersRef.current.forEach((timer) => clearInterval(timer));
      streamRevealTimersRef.current.clear();
      pendingStreamChunksRef.current.clear();
    },
    [],
  );

  return {
    pendingStreamChunksRef,
    streamRevealTimersRef,
    clearStreamReveal,
    flushStreamContent,
    ensureStreamReveal,
    enqueueStreamContent,
    deletePending,
    clearAll,
  };
}
