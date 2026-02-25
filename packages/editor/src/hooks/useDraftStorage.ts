import { useEffect, useRef, useCallback } from "react";

const DRAFT_PREFIX = "lowcode_draft_";

interface DraftData {
  json: string;
  savedAt: number; // timestamp
}

export function useDraftStorage(key: string, debounceMs = 1000) {
  const storageKey = `${DRAFT_PREFIX}${key}`;
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // 保存草稿（debounced）
  const saveDraft = useCallback(
    (json: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const data: DraftData = { json, savedAt: Date.now() };
        try {
          localStorage.setItem(storageKey, JSON.stringify(data));
        } catch {
          /* quota exceeded, silently fail */
        }
      }, debounceMs);
    },
    [storageKey, debounceMs],
  );

  // 加载草稿
  const loadDraft = useCallback((): DraftData | null => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, [storageKey]);

  // 清除草稿
  const clearDraft = useCallback(() => {
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  // 组件卸载时清除 timer
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return { saveDraft, loadDraft, clearDraft };
}
