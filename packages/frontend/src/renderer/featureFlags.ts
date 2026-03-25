/**
 * 渲染器 Feature Flags
 * 用于灰度控制新功能的开启/关闭
 *
 * 优先级：window.__RENDERER_FLAGS__ > URL 参数 > 默认值
 */

export const RENDERER_FLAGS_DEFAULTS = {
  /** 启用表达式选择性求值 */
  selectiveEvaluation: true,
} as const;

export type RendererFlagKey = keyof typeof RENDERER_FLAGS_DEFAULTS;

/**
 * 模块加载时缓存 URL 参数，避免每次 getFlag 都解析。
 *
 * 注意：URL 参数仅在模块初始化时读取一次，SPA 路由变化不会重新解析。
 * 这是有意为之的设计选择：
 *   1. window.__RENDERER_FLAGS__ 优先级更高，运行时切换应使用它
 *   2. URL 参数主要用于初始调试/灰度验证场景
 *   3. 避免热路径上反复解析 URL
 *
 * 运行时切换请使用 window.__RENDERER_FLAGS__，例如：
 *   (window as any).__RENDERER_FLAGS__ = { selectiveEvaluation: true };
 */
let cachedUrlFlags: Record<string, string | null> | null = null;

function getUrlFlags(): Record<string, string | null> {
  if (cachedUrlFlags !== null) return cachedUrlFlags;
  cachedUrlFlags = {};
  try {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      for (const key of Object.keys(RENDERER_FLAGS_DEFAULTS)) {
        cachedUrlFlags[key] = params.get(key);
      }
    }
  } catch {
    /* SSR safe */
  }
  return cachedUrlFlags;
}

/**
 * 读取 flag 值
 * 优先级：window.__RENDERER_FLAGS__ > URL 参数 > 默认值
 */
export function getFlag(key: RendererFlagKey): boolean {
  if (typeof window !== 'undefined') {
    // 1. 运行时覆盖（调试/灰度）
    const windowFlags = (window as any).__RENDERER_FLAGS__;
    if (windowFlags && typeof windowFlags[key] === 'boolean') {
      return windowFlags[key];
    }
    // 2. URL 参数覆盖（灰度验证，已缓存）
    const urlFlag = getUrlFlags()[key];
    if (urlFlag === 'true') return true;
    if (urlFlag === 'false') return false;
  }
  return RENDERER_FLAGS_DEFAULTS[key];
}
