/**
 * 统一的 HTTP 客户端 (Singleton Class Pattern)
 * 自动注入 Bearer Token 认证头部，支持流式请求
 */

type RequestOptionsMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface RequestOptions {
  method?: RequestOptionsMethod;
  headers?: Record<string, string>;
  body?: any;
  signal?: AbortSignal;
}

export class HttpClient {
  private apiSecret: string;
  private baseURL: string;

  constructor(baseURL: string = '', defaultSecret: string = 'dev-secret-token-change-in-production') {
    this.baseURL = baseURL;
    this.apiSecret = defaultSecret;
  }

  /**
   * 设置 API Secret（供宿主环境调用）
   */
  setApiSecret(token: string) {
    this.apiSecret = token;
  }

  /**
   * 内部核心请求方法
   */
  async request(url: string, options: RequestOptions = {}): Promise<Response> {
    const fullUrl = this.baseURL ? `${this.baseURL}${url}` : url;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.apiSecret) {
      headers['Authorization'] = `Bearer ${this.apiSecret}`;
    }

    const requestOptions: RequestInit = {
      method: options.method || 'GET',
      headers,
      signal: options.signal,
    };

    if (options.body !== undefined) {
      requestOptions.body = JSON.stringify(options.body);
    }

    return fetch(fullUrl, requestOptions);
  }

  /**
   * 处理响应，封装了统一的 JSON 解析和错误外抛
   */
  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorMessage;
      } catch {
        // 忽略 JSON 解析错误
      }

      const error = new Error(errorMessage) as any;
      error.status = response.status;
      throw error;
    }

    const contentType = response.headers.get('content-type');

    if (contentType?.includes('application/json')) {
      return response.json();
    }

    return response.text() as unknown as T;
  }

  // --- 暴露给业务的快捷方法 ---

  async get<T = any>(url: string, options?: Partial<RequestOptions>): Promise<T> {
    const response = await this.request(url, { ...options, method: 'GET' });
    return this.handleResponse<T>(response);
  }

  async post<T = any>(url: string, body?: any, options?: Partial<RequestOptions>): Promise<T> {
    const response = await this.request(url, { ...options, method: 'POST', body });
    return this.handleResponse<T>(response);
  }

  async put<T = any>(url: string, body?: any, options?: Partial<RequestOptions>): Promise<T> {
    const response = await this.request(url, { ...options, method: 'PUT', body });
    return this.handleResponse<T>(response);
  }

  async delete<T = any>(url: string, options?: Partial<RequestOptions>): Promise<T> {
    const response = await this.request(url, { ...options, method: 'DELETE' });
    return this.handleResponse<T>(response);
  }

  /**
   * 发送流式请求（用于 AI 流式响应）
   * 直接返回 Response，业务层通过 .body.getReader() 获取流
   */
  async streamRequest(url: string, body?: any): Promise<Response> {
    const response = await this.request(url, { method: 'POST', body });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorMessage;
      } catch {
        // ignore
      }
      throw new Error(errorMessage);
    }

    return response;
  }
}

// 导出一个默认的单例供全局直接使用
export const fetchApp = new HttpClient();