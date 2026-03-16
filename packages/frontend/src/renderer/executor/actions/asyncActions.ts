/**
 * 异步操作 Actions
 * apiCall, delay
 */

import type { ActionHandler } from '../../../types';
import type { ApiCallAction, DelayAction } from '../../../types/dsl/actions/async';
import type { Action } from '../../../types/dsl/action-union';
import type { ApiRequestConfig } from '../../../types/dsl/context';
import { resolveValue, resolveValues } from '../parser';

/**
 * URL 白名单检查（防止 SSRF）
 * 允许的协议：http, https
 * 阻止内网地址和文件协议
 */
function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // 只允许 http 和 https 协议
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    // 阻止内网地址（简单检查）
    const hostname = parsed.hostname.toLowerCase();
    const blockedPatterns = [
      /^localhost$/i,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^0\.0\.0\.0$/,
      /^::1$/,
      /^fc00:/i, // IPv6 内网
      /^fe80:/i, // IPv6 链路本地
    ];

    for (const pattern of blockedPatterns) {
      if (pattern.test(hostname)) {
        return false;
      }
    }

    return true;
  } catch {
    return false; // 无效的 URL
  }
}

/**
 * 原型污染防护：验证 resultTo 路径是否安全
 * 阻止 __proto__, constructor, prototype 等危险路径
 */
function validateResultToPath(path: string): void {
  const keys = path.split('.');
  for (const key of keys) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new Error(`apiCall: unsafe resultTo path "${key}"`);
    }
  }
}

/**
 * API 调用
 * Action: {
 *   type: 'apiCall';
 *   url: Value;
 *   method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
 *   body?: Value;
 *   headers?: Record<string, Value>;
 *   params?: Record<string, Value>;
 *   resultTo?: string;
 *   onSuccess?: Action[];
 *   onError?: Action[];
 *   showError?: boolean;
 * }
 */
export const apiCall: ActionHandler = async (action, context, executor) => {
  const apiAction = action as ApiCallAction;
  const {
    url,
    method = 'GET',
    body,
    headers,
    params,
    resultTo,
    onSuccess,
    onError,
    showError = true,
  } = apiAction;

  const resolvedUrl = resolveValue(url, context);
  const resolvedMethod = String(resolveValue(method, context)).toUpperCase();
  const resolvedBody = body ? resolveValue(body, context) : undefined;
  const resolvedHeaders = headers ? resolveValues(headers, context) : undefined;
  const resolvedParams = params ? resolveValues(params, context) : undefined;

  // SSRF 防护：验证 URL 安全性
  if (typeof resolvedUrl === 'string' && !isSafeUrl(resolvedUrl)) {
    throw new Error(
      `apiCall: blocked unsafe URL "${resolvedUrl}" - only http/https to public endpoints allowed`,
    );
  }

  // 原型污染防护：验证 resultTo 路径安全性（在 try-catch 外部抛出）
  if (resultTo) {
    validateResultToPath(resultTo);
  }

  try {
    // 构建 URL
    let fullUrl = resolvedUrl as string;
    if (resolvedParams) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(resolvedParams)) {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      }
      const queryString = searchParams.toString();
      if (queryString) {
        fullUrl += (fullUrl.includes('?') ? '&' : '?') + queryString;
      }
    }

    // 请求配置
    const config: RequestInit = {
      method: resolvedMethod,
      headers: {
        'Content-Type': 'application/json',
        ...resolvedHeaders,
      },
    };

    if (['POST', 'PUT', 'PATCH'].includes(resolvedMethod) && resolvedBody !== undefined) {
      config.body = JSON.stringify(resolvedBody);
    }

    let response: unknown;

    // 使用 context.api 或 fetch
    if (context.api) {
      const apiMethod = resolvedMethod.toLowerCase() as keyof typeof context.api;
      if (typeof context.api[apiMethod] === 'function') {
        const apiFn = context.api[apiMethod] as (url: string, body?: unknown) => Promise<unknown>;
        response = await (['GET', 'DELETE'].includes(resolvedMethod)
          ? apiFn(fullUrl)
          : apiFn(fullUrl, resolvedBody));
      } else if (typeof context.api.request === 'function') {
        const requestConfig: ApiRequestConfig = {
          url: resolvedUrl as string,
          method: resolvedMethod as ApiRequestConfig['method'],
          headers: (resolvedHeaders as Record<string, string> | undefined) ?? undefined,
          params: resolvedParams,
          data: resolvedBody,
        };
        response = await context.api.request(requestConfig);
      }
    } else {
      const fetchResponse = await fetch(fullUrl, config);
      if (!fetchResponse.ok) {
        const errorText = await fetchResponse.text();
        throw new Error(`HTTP ${fetchResponse.status}: ${errorText}`);
      }
      response = await fetchResponse.json();
    }

    // 保存结果
    if (resultTo) {
      // Phase 2: Runtime 路径 - 精准脏追踪
      if (context.runtime) {
        context.runtime.set(resultTo, response);
        // 不需要 markFullChange - runtime 追踪脏路径
      } else if (context.data) {
        // 遗留：直接变更路径（路径已在 try-catch 外部验证）
        const keys = resultTo.split('.');
        const lastKey = keys.pop();
        if (lastKey) {
          let target: Record<string, unknown> = context.data;
          for (const key of keys) {
            if (target[key] == null) target[key] = {};
            target = target[key] as Record<string, unknown>;
          }
          target[lastKey] = response;
        }

        // 通知响应式系统：API 结果写入无法精确追踪，标记全量变更
        if (typeof context.markFullChange === 'function') {
          context.markFullChange();
        }
      }
    }

    // 成功回调
    if (onSuccess && executor) {
      const typedExecutor = executor as {
        execute: (actions: Action[], ctx: unknown) => Promise<void>;
      };
      await typedExecutor.execute(onSuccess, { ...context, response });
    }

    return { success: true, response, resultTo };
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));

    if (showError) {
      if (context.ui?.message?.error) {
        context.ui.message.error(errorObj.message);
      } else {
        console.error('API call failed:', errorObj);
      }
    }

    // 错误回调
    if (onError && executor) {
      const typedExecutor = executor as {
        execute: (actions: Action[], ctx: unknown) => Promise<void>;
      };
      await typedExecutor.execute(onError, {
        ...context,
        error: errorObj.message,
        errorObject: errorObj,
      });
    }

    return { success: false, error: errorObj.message };
  }
};

/**
 * 延迟
 * Action: { type: 'delay'; ms: number; }
 */
export const delay: ActionHandler = async (action) => {
  const delayAction = action as DelayAction;
  const ms = typeof delayAction.ms === 'number' ? delayAction.ms : 0;

  if (Number.isNaN(ms) || ms < 0) {
    throw new Error('delay: ms must be a positive number');
  }

  await new Promise((resolve) => setTimeout(resolve, ms));

  return { delayed: ms };
};

/**
 * 导出所有异步操作 Actions
 */
export default {
  apiCall,
  delay,
};
