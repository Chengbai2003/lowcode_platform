import { useEffect, useRef, useCallback } from 'react';

const DRAFT_PREFIX = 'lowcode_draft_';

interface DraftData {
  json: string;
  savedAt: number; // timestamp
}

export function useDraftStorage(key: string, debounceMs = 1000) {
  const storageKey = `${DRAFT_PREFIX}${key}`;
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const saveInProgressRef = useRef(false); // 防止并发保存

  // 保存草稿（debounced）
  const saveDraft = useCallback(
    (json: string) => {
      if (saveInProgressRef.current) {
        // 如果正在保存，延迟执行
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => saveDraft(json), debounceMs);
        return;
      }

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        saveInProgressRef.current = true;
        const data: DraftData = { json, savedAt: Date.now() };
        try {
          // 使用异步存储以避免阻塞主线程
          await new Promise((resolve) => {
            setTimeout(() => {
              localStorage.setItem(storageKey, JSON.stringify(data));
              resolve(undefined);
            }, 0);
          });
        } catch (error) {
          console.error('Failed to save draft:', error);
        } finally {
          saveInProgressRef.current = false;
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
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.error('Failed to clear draft:', error);
    }
  }, [storageKey]);

  // 组件卸载时清除 timer
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      saveInProgressRef.current = false;
    },
    [],
  );

  return { saveDraft, loadDraft, clearDraft };
}
