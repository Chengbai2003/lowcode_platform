/**
 * 异步操作 Actions
 * apiCall, delay, waitCondition
 */

import type { ActionHandler } from "@lowcode-platform/types";
import { resolveValue, resolveValues } from "../parser";

/**
 * API调用
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
    method = "GET",
    body,
    headers,
    params,
    resultTo,
    onSuccess,
    onError,
    showError = true,
  } = action;

  const resolvedUrl = resolveValue(url, context);
  const resolvedMethod = resolveValue(method, context);
  const resolvedBody = body ? resolveValue(body, context) : undefined;
  const resolvedHeaders = headers ? resolveValues(headers, context) : undefined;
  const resolvedParams = params ? resolveValues(params, context) : undefined;

  try {
    // 构建完整URL
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
        fullUrl += (fullUrl.includes("?") ? "&" : "?") + queryString;
      }
    }

    // 准备请求配置
    const config: RequestInit = {
      method: String(resolvedMethod).toUpperCase(),
      headers: {
        "Content-Type": "application/json",
        ...(resolvedHeaders as Record<string, string>),
      },
    };

    if (
      ["POST", "PUT", "PATCH"].includes(String(resolvedMethod).toUpperCase())
    ) {
      if (resolvedBody !== undefined) {
        config.body = JSON.stringify(resolvedBody);
      }
    }

    let response: any;

    // 使用context中的api方法（如果存在）
    if (context.api) {
      const apiMethod = String(
        resolvedMethod,
      ).toLowerCase() as keyof typeof context.api;
      if (typeof context.api[apiMethod] === "function") {
        const apiFn = context.api[apiMethod] as any;
        const args = ["GET", "DELETE"].includes(
          String(resolvedMethod).toUpperCase(),
        )
          ? [fullUrl]
          : [fullUrl, resolvedBody];
        response = await apiFn(...args);
      } else if (typeof context.api.request === "function") {
        response = await context.api.request(config);
      }
    } else {
      // 降级到fetch
      const fetchResponse = await fetch(fullUrl, config);

      if (!fetchResponse.ok) {
        const errorText = await fetchResponse.text();
        throw new Error(`HTTP ${fetchResponse.status}: ${errorText}`);
      }

      response = await fetchResponse.json();
    }

    // 保存结果
    if (resultTo) {
      if (context.dispatch) {
        context.dispatch({
          type: "SET_FIELD",
          payload: { field: resultTo, value: response },
        });
      }
      // 同时更新context.data
      if (context.data) {
        setNestedValue(context.data, resultTo, response);
      }
    }

    // 执行成功回调
    if (onSuccess && executor) {
      // 将API响应添加到上下文
      const responseContext = {
        ...context,
        response,
      };
      await executor.execute(onSuccess, responseContext);
    }

    return { success: true, response, resultTo };
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));

    // 显示错误提示
    if (showError) {
      if (context.ui?.message?.error) {
        context.ui.message.error(errorObj.message);
      } else {
        console.error("API call failed:", errorObj);
      }
    }

    // 执行错误回调
    if (onError && executor) {
      // 将错误信息添加到上下文
      const errorContext = {
        ...context,
        error: errorObj.message,
        errorObject: errorObj,
      };
      await executor.execute(onError, errorContext);
    }

    return { success: false, error: errorObj.message };
  }
};

/**
 * 延迟执行
 * Action: { type: 'delay'; ms: number; }
 */
export const delay: ActionHandler = async (action) => {
  const { ms } = action;

  if (typeof ms !== "number" || ms < 0) {
    throw new Error("delay: ms must be a positive number");
  }

  await new Promise((resolve) => setTimeout(resolve, ms));

  return { delayed: ms };
};

/**
 * 等待条件满足
 * Action: {
 *   type: 'waitCondition';
 *   condition: Value;
 *   interval?: number;
 *   timeout?: number;
 *   onTimeout?: Action[];
 * }
 */
export const waitCondition: ActionHandler = async (
  action,
  context,
  executor,
) => {
  const { condition, interval = 100, timeout = 30000, onTimeout } = action;

  const startTime = Date.now();
  const resolvedInterval = resolveValue(interval, context);
  const resolvedTimeout = resolveValue(timeout, context);

  while (true) {
    // 检查超时
    if (Date.now() - startTime > resolvedTimeout) {
      if (onTimeout && executor) {
        await executor.execute(onTimeout, context);
      }
      return { success: false, timeout: true };
    }

    // 检查条件
    const resolvedCondition = resolveValue(condition, context);
    const isMet = Boolean(resolvedCondition);

    if (isMet) {
      return { success: true, condition: resolvedCondition };
    }

    // 等待
    await new Promise((resolve) => setTimeout(resolve, resolvedInterval));
  }
};

/**
 * 辅助函数：设置嵌套属性值
 */
function setNestedValue(
  obj: Record<string, any>,
  path: string,
  value: any,
): void {
  const keys = path.split(".");
  const lastKey = keys.pop();

  if (!lastKey) {
    return;
  }

  let current = obj;

  for (const key of keys) {
    if (current[key] == null || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key];
  }

  current[lastKey] = value;
}

/**
 * 导出所有异步操作Actions
 */
export default {
  apiCall,
  delay,
  waitCondition,
};
