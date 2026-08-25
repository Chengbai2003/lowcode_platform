import { useEffect, useMemo, useRef } from 'react';
import {
  cloneInternalColumn,
  isTableActionColumn,
  sanitizeTableColumnsValue,
  type TableColumnItem,
} from '../complexValueUtils';

/**
 * 5-step stableId reconciliation: legacy id → unique key → kind+dataIndex → position → UUID
 * plus button stabilization and cross-component isolation via sourceIdentity.
 */
export function useStableIdReconcile(
  value: unknown,
  template: TableColumnItem[],
  sourceIdentity?: string,
): TableColumnItem[] {
  const stableIdByKeyRef = useRef<Map<string, string>>(new Map());
  const stableIdByKindDataRef = useRef<Map<string, string>>(new Map());
  const stableIdByPositionRef = useRef<Map<number, string>>(new Map());
  const stableButtonIdMapRef = useRef<Map<string, string>>(new Map());
  const prevSourceIdentityRef = useRef<string | undefined>(sourceIdentity);

  useEffect(() => {
    if (prevSourceIdentityRef.current !== sourceIdentity) {
      prevSourceIdentityRef.current = sourceIdentity;
      stableIdByKeyRef.current.clear();
      stableIdByKindDataRef.current.clear();
      stableIdByPositionRef.current.clear();
      stableButtonIdMapRef.current.clear();
    }
  }, [sourceIdentity]);

  const columns = useMemo(() => {
    const sanitized = sanitizeTableColumnsValue(value, template);
    const rawArr = Array.isArray(value) ? (value as unknown[]) : [];

    const keyCount = new Map<string, number>();
    const kindDataCount = new Map<string, number>();
    for (const c of sanitized) {
      const k = (c as unknown as { key?: unknown }).key;
      if (typeof k === 'string') keyCount.set(k, (keyCount.get(k) ?? 0) + 1);
      const kind = (c as unknown as { kind?: string }).kind ?? 'data';
      const di = (c as unknown as { dataIndex?: unknown }).dataIndex;
      if (typeof di === 'string' && di) {
        const kd = `${kind}:${di}`;
        kindDataCount.set(kd, (kindDataCount.get(kd) ?? 0) + 1);
      }
    }

    const seenSids = new Set<string>();
    const genNewSid = (): string => {
      try {
        const maybe =
          typeof crypto !== 'undefined' && (crypto as { randomUUID?: () => string }).randomUUID;
        if (maybe) return `col_${maybe.call(crypto)}`;
      } catch {}
      return `col_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    };

    const nextColumns = sanitized.map((col, idx) => {
      let sid = (col as unknown as { __stableId?: string }).__stableId;
      const rawItem = rawArr[idx] as Record<string, unknown> | undefined;

      let legacyId: string | undefined;
      if (rawItem) {
        if (typeof rawItem.__stableId === 'string' && (rawItem.__stableId as string).trim()) {
          legacyId = (rawItem.__stableId as string).trim();
        } else if (typeof rawItem._stableId === 'string' && (rawItem._stableId as string).trim()) {
          legacyId = (rawItem._stableId as string).trim();
        } else if (typeof rawItem._id === 'string' && (rawItem._id as string).trim()) {
          legacyId = (rawItem._id as string).trim();
        }
      }
      let reused = false;
      if (legacyId) {
        sid = legacyId;
        reused = true;
      } else {
        const key = (col as unknown as { key?: unknown }).key;
        if (typeof key === 'string' && keyCount.get(key) === 1) {
          const prev = stableIdByKeyRef.current.get(key);
          if (prev) {
            sid = prev;
            reused = true;
          }
        }
        if (!reused) {
          const kind = (col as unknown as { kind?: string }).kind ?? 'data';
          const di = (col as unknown as { dataIndex?: unknown }).dataIndex;
          if (typeof di === 'string' && di) {
            const kd = `${kind}:${di}`;
            if (kindDataCount.get(kd) === 1) {
              const prev2 = stableIdByKindDataRef.current.get(kd);
              if (prev2) {
                sid = prev2;
                reused = true;
              }
            }
          }
        }
        if (!reused) {
          const prevPos = stableIdByPositionRef.current.get(idx);
          if (prevPos) {
            sid = prevPos;
            reused = true;
          }
        }
      }

      if (sid && seenSids.has(sid)) {
        sid = genNewSid();
      }
      if (sid) seenSids.add(sid);

      if (sid) {
        const key = (col as unknown as { key?: unknown }).key;
        if (typeof key === 'string') stableIdByKeyRef.current.set(key, sid);
        const kind = (col as unknown as { kind?: string }).kind ?? 'data';
        const di = (col as unknown as { dataIndex?: unknown }).dataIndex;
        if (typeof di === 'string' && di) {
          const kd = `${kind}:${di}`;
          stableIdByKindDataRef.current.set(kd, sid);
        }
        stableIdByPositionRef.current.set(idx, sid);
      }

      if (
        isTableActionColumn(col as unknown as TableColumnItem) &&
        Array.isArray((col as unknown as { buttons?: unknown }).buttons)
      ) {
        const rawButtons =
          rawItem && Array.isArray(rawItem.buttons)
            ? (rawItem.buttons as Array<Record<string, unknown>>)
            : [];
        const sanitizedButtons = (
          col as unknown as { buttons: Array<Record<string, unknown> & { __stableId?: string }> }
        ).buttons;
        const nextButtons = sanitizedButtons.map((btn, bIdx) => {
          let bSid = (btn as { __stableId?: string }).__stableId;
          const rawBtn = rawButtons[bIdx] as Record<string, unknown> | undefined;
          let bLegacy: string | undefined;
          if (rawBtn) {
            if (typeof rawBtn.__stableId === 'string' && (rawBtn.__stableId as string).trim())
              bLegacy = (rawBtn.__stableId as string).trim();
            else if (typeof rawBtn._stableId === 'string' && (rawBtn._stableId as string).trim())
              bLegacy = (rawBtn._stableId as string).trim();
            else if (typeof rawBtn._id === 'string' && (rawBtn._id as string).trim())
              bLegacy = (rawBtn._id as string).trim();
          }
          if (bLegacy) {
            bSid = bLegacy;
          } else if (sid) {
            const cacheKey = `${sid}__btn-${bIdx}`;
            const cached = stableButtonIdMapRef.current.get(cacheKey);
            if (cached) bSid = cached;
          }
          if (sid && bSid) {
            const cacheKey = `${sid}__btn-${bIdx}`;
            stableButtonIdMapRef.current.set(cacheKey, bSid);
          }
          return {
            ...(btn as unknown as Record<string, unknown>),
            __stableId: bSid,
          } as unknown as typeof btn;
        });
        const withSidAndButtons = {
          ...(col as unknown as Record<string, unknown>),
          __stableId: sid,
          buttons: nextButtons,
        } as unknown as TableColumnItem;
        return cloneInternalColumn(withSidAndButtons) as TableColumnItem;
      }

      if (sid && sid !== (col as unknown as { __stableId?: string }).__stableId) {
        return cloneInternalColumn({
          ...(col as unknown as Record<string, unknown>),
          __stableId: sid,
        } as unknown as TableColumnItem) as TableColumnItem;
      }
      return col;
    });

    return nextColumns;
  }, [value, template, sourceIdentity]);

  return columns;
}
