const ENCODED_BACKSLASH_RE = /%(?:25)*5c/i;
export function sanitizeNavigationTarget(input: unknown): string {
  if (typeof input !== 'string') return '/';
  if (/[\x00-\x20\x7f\\]/.test(input)) return '/';
  if (ENCODED_BACKSLASH_RE.test(input)) return '/';
  if (input !== input.trim()) return '/';
  const v = input.trim();
  if (!v || !v.startsWith('/') || v.startsWith('//')) return '/';
  try {
    const base = new URL('https://lowcode.internal');
    const p = new URL(v, base);
    if (p.origin !== base.origin) return '/';
    return `${p.pathname}${p.search}${p.hash}` || '/';
  } catch {
    return '/';
  }
}
export function buildNavigationTarget(input: unknown, params?: Record<string, unknown>): string {
  const target = sanitizeNavigationTarget(input);
  if (!params) return target;
  try {
    const url = new URL(target, 'https://lowcode.internal');
    for (const [k, v] of Object.entries(params)) {
      if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        url.searchParams.set(k, String(v));
      }
    }
    return `${url.pathname}${url.search}${url.hash}` || '/';
  } catch {
    return target;
  }
}
