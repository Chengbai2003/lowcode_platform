/**
 * 异步操作 Actions
 * apiCall, delay
 */

import type { ActionHandler } from '../../../types';
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
  } = action;

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

  try {
    // 构建 URL
    let fullUrl = resolvedUrl;
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
        ...(resolvedHeaders as Record<string, string>),
      },
    };

    if (['POST', 'PUT', 'PATCH'].includes(resolvedMethod) && resolvedBody !== undefined) {
      config.body = JSON.stringify(resolvedBody);
    }

    let response: any;

    // 使用 context.api 或 fetch
    if (context.api) {
      const apiMethod = resolvedMethod.toLowerCase() as keyof typeof context.api;
      if (typeof context.api[apiMethod] === 'function') {
        const apiFn = context.api[apiMethod] as any;
        response = await (['GET', 'DELETE'].includes(resolvedMethod)
          ? apiFn(fullUrl)
          : apiFn(fullUrl, resolvedBody));
      } else if (typeof context.api.request === 'function') {
        response = await context.api.request(config);
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
    if (resultTo && context.data) {
      const keys = resultTo.split('.');
      const lastKey = keys.pop();
      if (lastKey) {
        let target = context.data;
        for (const key of keys) {
          if (target[key] == null) target[key] = {};
          target = target[key];
        }
        target[lastKey] = response;
      }
    }

    // 成功回调
    if (onSuccess && executor) {
      await executor.execute(onSuccess, { ...context, response });
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
      await executor.execute(onError, {
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
  const { ms } = action;

  if (typeof ms !== 'number' || ms < 0) {
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
