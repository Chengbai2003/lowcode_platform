import type { TableColumnItem } from '../complexValueUtils';

/**
 * Strip internal __stableId before external onChange.
 * sanitize outputs retain it, so manual filter is needed.
 */
export function stripStableIds(columns: TableColumnItem[]): TableColumnItem[] {
  return columns.map((col) => {
    const { __stableId: _colId, ...rest } = col as TableColumnItem & { __stableId?: string };
    if ('buttons' in rest && Array.isArray((rest as { buttons?: unknown[] }).buttons)) {
      const r = rest as unknown as { buttons: Array<{ __stableId?: string }> } & typeof rest;
      const buttons = r.buttons.map((b) => {
        const { __stableId: _bid, ...bRest } = b as { __stableId?: string } & Record<
          string,
          unknown
        >;
        return bRest;
      });
      return { ...rest, buttons } as unknown as TableColumnItem;
    }
    return rest as TableColumnItem;
  });
}

export function toWidth(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const width = Number(trimmed);
  return Number.isFinite(width) && width > 0 ? width : undefined;
}
