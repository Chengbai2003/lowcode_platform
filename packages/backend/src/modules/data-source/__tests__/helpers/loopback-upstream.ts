import * as http from 'http';
import { AddressInfo } from 'net';

export interface UpstreamSearchItem {
  id: string;
  title: string;
  price: number;
}

/**
 * 隔离受控上游服务（M1b-1 PR B 测试专用）。
 *
 * 只绑定 127.0.0.1 回环地址，按路径计数请求并观测客户端是否在响应完成前
 * 中止连接（证明「流式读取过程中终止」而非「完整读取后才检测」）。
 * 该服务只存在于测试进程；生产默认配置不解析任何 loopback 目标。
 */
export class LoopbackUpstreamServer {
  private readonly server: http.Server;
  private readonly requestCounts = new Map<string, number>();
  private readonly prematureCloses = new Map<string, number>();
  private readonly requestUrls: string[] = [];

  private constructor(server: http.Server) {
    this.server = server;
  }

  static async create(
    handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
  ): Promise<LoopbackUpstreamServer> {
    const upstream = new LoopbackUpstreamServer(
      http.createServer((req, res) => {
        const pathKey = (req.url ?? '/').split('?')[0];
        upstream.requestCounts.set(pathKey, (upstream.requestCounts.get(pathKey) ?? 0) + 1);
        upstream.requestUrls.push(req.url ?? '/');
        res.on('close', () => {
          if (!res.writableEnded) {
            upstream.prematureCloses.set(pathKey, (upstream.prematureCloses.get(pathKey) ?? 0) + 1);
          }
        });
        handler(req, res);
      }),
    );
    await new Promise<void>((resolve, reject) => {
      upstream.server.once('error', reject);
      upstream.server.listen(0, '127.0.0.1', () => resolve());
    });
    return upstream;
  }

  get port(): number {
    return (this.server.address() as AddressInfo).port;
  }

  url(path: string): string {
    return `http://127.0.0.1:${this.port}${path}`;
  }

  countFor(path: string): number {
    return this.requestCounts.get(path) ?? 0;
  }

  totalRequests(): number {
    let total = 0;
    for (const count of this.requestCounts.values()) {
      total += count;
    }
    return total;
  }

  /** 响应未写完即被客户端中止的请求数（流式限额提前终止的证据） */
  prematureClosesFor(path: string): number {
    return this.prematureCloses.get(path) ?? 0;
  }

  requestUrl(index: number): string | undefined {
    return this.requestUrls[index];
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(''));
  });
}

async function readSearchParams(req: http.IncomingMessage): Promise<URLSearchParams> {
  const body = await readBody(req);
  const query = (req.url ?? '').split('?')[1] ?? '';
  const params = new URLSearchParams(query);
  if (body) {
    for (const [key, value] of new URLSearchParams(body)) {
      params.set(key, value);
    }
  }
  return params;
}

/** 正常搜索行为：按 query 过滤、按 limit 截断 */
export async function searchBehavior(
  items: UpstreamSearchItem[],
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const params = await readSearchParams(req);
  const query = params.get('query') ?? '';
  const limit = Number(params.get('limit') ?? '10');
  const filtered = items.filter((item) =>
    query ? item.title.toLowerCase().includes(query.toLowerCase()) : true,
  );
  const sliced = filtered.slice(0, Number.isFinite(limit) && limit > 0 ? limit : 10);
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ items: sliced }));
}

/** 固定 JSON 响应 */
export function jsonBehavior(
  status: number,
  body: unknown,
): (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> {
  return async (_req, res) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };
}

/** 超过限额的大响应：分块流式写出，块间让出事件循环使中止有机会传播 */
export async function oversizedBehavior(
  totalBytes: number,
  chunkSize: number,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const chunk = 'a'.repeat(chunkSize);
  res.writeHead(200, { 'content-type': 'application/json' });
  let written = 0;
  while (written < totalBytes && !res.writableEnded && !res.destroyed) {
    const payload =
      written + chunk.length <= totalBytes ? chunk : chunk.slice(0, totalBytes - written);
    res.write(payload);
    written += payload.length;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  if (!res.writableEnded && !res.destroyed) {
    res.end();
  }
}

/** 深度炸弹：未闭合的嵌套数组前缀，超过任何合理 JSON 深度 */
export function depthBombBehavior(
  depth: number,
): (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> {
  return async (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('['.repeat(depth));
  };
}

/** 延迟响应（用于超时与并发占用） */
export function slowBehavior(
  delayMs: number,
  respond: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> {
  return async (req, res) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (!res.writableEnded && !res.destroyed) {
      respond(req, res);
    }
  };
}

/** HTTP 重定向（默认不跟随） */
export function redirectBehavior(
  location: string,
): (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> {
  return async (_req, res) => {
    res.writeHead(302, { location });
    res.end();
  };
}

export function route(
  routes: Record<string, (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>>,
): (req: http.IncomingMessage, res: http.ServerResponse) => void {
  return (req, res) => {
    const pathKey = (req.url ?? '/').split('?')[0];
    const handler = routes[pathKey];
    if (!handler) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'no such route' }));
      return;
    }
    void handler(req, res).catch(() => {
      if (!res.writableEnded) {
        res.destroy();
      }
    });
  };
}
