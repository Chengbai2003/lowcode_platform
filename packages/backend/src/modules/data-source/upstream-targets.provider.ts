import type { TrustedOperationDefinition } from './trusted-operation-registry';

/**
 * 上游目标绑定（trusted host config）。
 *
 * key 为精确 `${operationId}@${revision}`，value 为绝对 URL（含协议、主机、
 * 端口与路径）。该表只能来自服务端可信配置，页面 Schema、Agent Patch 与
 * 客户端请求均无法注入；默认为空 —— 任何 Operation 在默认部署下都解析不到
 * 目标，执行以 FORBIDDEN fail-close，不存在匿名生产路由或公网默认例外。
 */
export const DATA_SOURCE_UPSTREAM_TARGETS = Symbol('DATA_SOURCE_UPSTREAM_TARGETS');

export type UpstreamTargetBindings = Readonly<Record<string, string>>;

export const EMPTY_UPSTREAM_TARGETS: UpstreamTargetBindings = Object.freeze({});

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (LOOPBACK_HOSTS.has(normalized)) {
    return true;
  }
  // 127.0.0.0/8 整段均为 loopback
  return /^127(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(normalized);
}

/**
 * 解析 Operation 的上游目标。
 *
 * Resolver/Executor 不接受 Schema 或请求提供目标地址：目标只来自可信绑定表，
 * 且注册项声明的目标约束（loopback-only）在解析时强制执行 —— 即使可信配置
 * 被误配为公网地址，loopback-only 操作也解析失败（FORBIDDEN），不会发出请求。
 */
export function resolveUpstreamTarget(
  entry: TrustedOperationDefinition,
  bindings: UpstreamTargetBindings,
): URL | undefined {
  const raw = bindings[`${entry.operationId}@${entry.revision}`];
  if (typeof raw !== 'string' || !raw.trim()) {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return undefined;
  }
  if (entry.targetConstraint === 'loopback-only' && !isLoopbackHostname(url.hostname)) {
    return undefined;
  }
  return url;
}
