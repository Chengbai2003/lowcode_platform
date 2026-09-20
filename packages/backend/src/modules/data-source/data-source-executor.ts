import { Injectable, Logger } from '@nestjs/common';
import type { DataSourceExecutionLimits } from '@lowcode-platform/schema-contract';

/**
 * 唯一的数据源上游执行器（M1b-1 PR B / ADR-0005）。
 *
 * - 只执行「可信注册项 + 可信目标绑定」解析出的请求；目标地址绝不来自
 *   页面 Schema 或客户端请求。
 * - 服务端独立截止时间（不依赖调用方 signal）；超时中止请求并返回 TIMEOUT。
 * - `redirect: 'error'`：不跟随重定向，防止绕过目标约束。
 * - 响应在流式读取过程中强制字节与 JSON 深度限额，超限立即中止连接，
 *   绝不完整读取后才检测。
 */
export type DataSourceExecutorOutcome =
  | { readonly status: 'success'; readonly json: unknown }
  | {
      readonly status: 'failure';
      readonly code: 'INVALID_RESULT' | 'TIMEOUT' | 'UPSTREAM_FAILURE';
      /** 安全原因描述：不含上游 URL、端口或凭据（客户端可见） */
      readonly reason: string;
    };

export interface DataSourceExecutorRequest {
  readonly target: URL;
  readonly method: 'GET';
  /** 已通过 Operation 输入契约校验的参数（序列化为查询串） */
  readonly query: Readonly<Record<string, string>>;
  readonly limits: DataSourceExecutionLimits;
}

class ResponseLimitViolation extends Error {
  constructor(
    readonly violation: 'bytes' | 'depth',
    message: string,
  ) {
    super(message);
  }
}

/**
 * 流式 JSON 深度扫描：在字节到达时跟踪括号深度（跳过字符串字面量），
 * 超限立即抛出。这是 JSON.parse 之前的前置防线 —— 深度炸弹在解析
 * 可能压栈之前就被终止。
 */
export class StreamingJsonDepthScanner {
  private depth = 0;
  private inString = false;
  private escaped = false;

  constructor(private readonly maxDepth: number) {}

  feed(text: string): void {
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (this.inString) {
        if (this.escaped) {
          this.escaped = false;
        } else if (ch === '\\') {
          this.escaped = true;
        } else if (ch === '"') {
          this.inString = false;
        }
        continue;
      }
      if (ch === '"') {
        this.inString = true;
      } else if (ch === '{' || ch === '[') {
        this.depth += 1;
        if (this.depth > this.maxDepth) {
          throw new ResponseLimitViolation(
            'depth',
            `response JSON nesting depth exceeded limit of ${this.maxDepth}`,
          );
        }
      } else if (ch === '}' || ch === ']') {
        this.depth = Math.max(0, this.depth - 1);
      }
    }
  }
}

async function readBodyWithLimits(
  response: Response,
  limits: DataSourceExecutionLimits,
  abort: AbortController,
): Promise<string> {
  if (!response.body) {
    return '';
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  const scanner = new StreamingJsonDepthScanner(limits.maxJsonDepth);
  const chunks: string[] = [];
  let received = 0;

  // 任何限额违规都必须取消读取并中止整个连接（销毁 socket），
  // 否则上游可继续写入已判定违规的响应；两种违规走同一清理路径。
  const violate = async (violation: ResponseLimitViolation): Promise<never> => {
    await reader.cancel().catch(() => undefined);
    abort.abort();
    throw violation;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    received += value.byteLength;
    if (received > limits.maxResponseBytes) {
      await violate(
        new ResponseLimitViolation(
          'bytes',
          `response size exceeded limit of ${limits.maxResponseBytes} bytes`,
        ),
      );
    }
    const text = decoder.decode(value, { stream: true });
    try {
      scanner.feed(text);
    } catch (error) {
      if (error instanceof ResponseLimitViolation) {
        await violate(error);
      }
      throw error;
    }
    chunks.push(text);
  }
  chunks.push(decoder.decode());
  return chunks.join('');
}

@Injectable()
export class DataSourceExecutor {
  private readonly logger = new Logger(DataSourceExecutor.name);

  async execute(request: DataSourceExecutorRequest): Promise<DataSourceExecutorOutcome> {
    const abort = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      abort.abort();
    }, request.limits.deadlineMs);

    const url = new URL(request.target.toString());
    const search = new URLSearchParams(url.search);
    for (const [key, value] of Object.entries(request.query)) {
      search.set(key, value);
    }
    url.search = search.toString();

    try {
      const response = await fetch(url, {
        method: request.method,
        redirect: 'error',
        signal: abort.signal,
        headers: { accept: 'application/json' },
      });

      if (!response.ok) {
        // 错误响应体不读取（可能超限）；日志含状态码供服务端排查
        await response.body?.cancel().catch(() => undefined);
        this.logger.warn(`Upstream returned HTTP ${response.status} for a trusted operation`);
        return {
          status: 'failure',
          code: 'UPSTREAM_FAILURE',
          reason: 'upstream service returned an error status',
        };
      }

      let text: string;
      try {
        text = await readBodyWithLimits(response, request.limits, abort);
      } catch (error) {
        if (error instanceof ResponseLimitViolation) {
          return { status: 'failure', code: 'INVALID_RESULT', reason: error.message };
        }
        throw error;
      }

      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        return { status: 'failure', code: 'INVALID_RESULT', reason: 'response is not valid JSON' };
      }
      return { status: 'success', json };
    } catch (error) {
      if (timedOut) {
        return {
          status: 'failure',
          code: 'TIMEOUT',
          reason: `execution exceeded server-side deadline of ${request.limits.deadlineMs}ms`,
        };
      }
      // 兜底中止：任何未经过限额清理路径的传输异常也确保销毁连接，
      // 不给上游留下继续写入已放弃响应的机会（重复 abort 无害）
      abort.abort();
      // 传输层失败细节只进服务端日志；客户端只收到脱敏原因
      this.logger.warn(
        `Data source upstream transport failure: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        status: 'failure',
        code: 'UPSTREAM_FAILURE',
        reason: 'upstream request failed at the transport layer',
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
