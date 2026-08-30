/**
 * HostCapabilities（Issue #19 / M0-4 Scope E）
 *
 * Renderer 默认不拥有任何宿主权限：导航、弹窗、网络、数据资源能力
 * 全部默认 deny（fail-close），宿主必须经不可变的 HostCapabilities
 * 显式授予。宿主经执行上下文显式注入的自有实现（context.navigate /
 * context.ui / context.api）不属于 Renderer 内置权限，不受此门控约束。
 */

export interface HostCapabilities {
  /** navigate/back 的内置 window.location 回退（宿主注入 context.navigate 不受此限） */
  readonly navigation: boolean;
  /** dialog 动作在无宿主 UI 库时的 window.confirm/alert 回退 */
  readonly dialogs: boolean;
  /** apiCall 在无宿主 api 客户端时的内置 fetch 回退 */
  readonly network: boolean;
  /** 数据资源读取（M1b 前恒为 deny） */
  readonly dataResources: boolean;
}

export const HOST_CAPABILITY_KEYS = ['navigation', 'dialogs', 'network', 'dataResources'] as const;

export type HostCapabilityKey = (typeof HOST_CAPABILITY_KEYS)[number];

/** 全部 deny 的默认能力集（冻结） */
export const DEFAULT_HOST_CAPABILITIES: Readonly<HostCapabilities> = Object.freeze({
  navigation: false,
  dialogs: false,
  network: false,
  dataResources: false,
});

/**
 * 归一化宿主能力：未知键忽略、非 true 值一律 deny；返回冻结对象，
 * 注入后运行时不可变。
 */
export function normalizeHostCapabilities(
  input?: Partial<HostCapabilities> | null,
): Readonly<HostCapabilities> {
  const out: Record<HostCapabilityKey, boolean> = {
    navigation: false,
    dialogs: false,
    network: false,
    dataResources: false,
  };
  if (input && typeof input === 'object') {
    for (const key of HOST_CAPABILITY_KEYS) {
      out[key] = (input as Record<string, unknown>)[key] === true;
    }
  }
  return Object.freeze(out);
}

/**
 * 从执行上下文读取能力集；缺失（旧上下文）时按默认全 deny 处理。
 */
export function getHostCapabilities(context: unknown): Readonly<HostCapabilities> {
  const caps = (context as { hostCapabilities?: Readonly<HostCapabilities> } | null)
    ?.hostCapabilities;
  if (!caps || typeof caps !== 'object') {
    return DEFAULT_HOST_CAPABILITIES;
  }
  return normalizeHostCapabilities(caps);
}

/**
 * 能力判定：仅显式 true 视为授予（fail-close）。
 */
export function isCapabilityGranted(
  capabilities: Readonly<HostCapabilities> | undefined | null,
  key: HostCapabilityKey,
): boolean {
  return capabilities?.[key] === true;
}
