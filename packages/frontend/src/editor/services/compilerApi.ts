/**
 * Compiler API 服务
 * 调用后端编译 API
 */

import type { A2UISchema } from '../../types';

/**
 * 编译选项
 */
export interface CompileOptions {
  componentSources?: Record<string, string>;
  defaultLibrary?: string;
}

/**
 * 编译响应
 */
export interface CompileResponse {
  success: boolean;
  data: {
    code: string;
    raw: string;
  };
}

/**
 * 获取 API 基础 URL
 */
function getApiBaseUrl(): string {
  // 优先使用环境变量
  if (typeof window !== 'undefined') {
    const envUrl = (window as any).__LOWCODE_API_URL__;
    if (envUrl) return envUrl;

    // 默认本地开发地址
    return 'http://localhost:3000/api/v1';
  }
  return 'http://localhost:3000/api/v1';
}

/**
 * 获取认证 Token
 */
function getAuthToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('lowcode_token');
  }
  return null;
}

/**
 * 编译 Schema 为 React 代码
 */
export async function compileSchema(schema: A2UISchema, options?: CompileOptions): Promise<string> {
  const baseUrl = getApiBaseUrl();
  const token = getAuthToken();

  const response = await fetch(`${baseUrl}/compiler/export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      schema,
      options,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`编译失败: ${response.status} ${error}`);
  }

  const result: CompileResponse = await response.json();

  if (!result.success) {
    throw new Error('编译失败: 服务器返回错误');
  }

  return result.data.code;
}

/**
 * 检查后端编译服务是否可用
 */
export async function checkCompilerHealth(): Promise<boolean> {
  try {
    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}/compiler/health`, {
      method: 'GET',
    });
    return response.ok;
  } catch {
    return false;
  }
}
