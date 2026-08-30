import type { ComponentPreset } from './types';

/**
 * Manifest 驱动的 Props 净化（Issue #19 / M0-4 Scope B，fail-close）
 *
 * 仅对解析到 Preset 自身组件的类型调用（宿主经 components 覆盖的组件
 * 不受 Preset Manifest 约束）。规则：
 * 1. 危险 DOM Props（dangerouslySetInnerHTML）一律移除；
 * 2. 函数型 Props 一律移除（组件不得从 Schema Props 获得可执行代码）；
 * 3. 不在 Manifest allowedProps 白名单内的未知 Props 移除；
 * 4. 之后执行 Preset 的组件级 Validation 钩子（可进一步净化或抛错拒绝）。
 *
 * 返回的 Props 对象被冻结，被移除的键通过 rejected 返回供上层告警。
 */
export function sanitizePropsByManifest(
  componentType: string,
  props: Record<string, unknown>,
  preset: ComponentPreset,
): { props: Record<string, unknown>; rejected: string[] } {
  const entry = preset.manifest[componentType];
  if (!entry) {
    // 无 Manifest 条目的组件不应进入本函数（由调用方按 preset-owned 过滤）；
    // 防御性兜底：整体拒绝传递，避免未声明的 Props 泄漏。
    return { props: Object.freeze({}), rejected: Object.keys(props) };
  }

  const allowed = new Set(entry.allowedProps);
  const rejected: string[] = [];
  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(props)) {
    if (key === 'dangerouslySetInnerHTML') {
      rejected.push(key);
      continue;
    }
    if (typeof value === 'function') {
      rejected.push(key);
      continue;
    }
    if (!allowed.has(key)) {
      rejected.push(key);
      continue;
    }
    cleaned[key] = value;
  }

  const validator = preset.validation[componentType];
  const finalProps = validator ? validator(cleaned, entry) : cleaned;

  return { props: Object.freeze({ ...finalProps }), rejected };
}
