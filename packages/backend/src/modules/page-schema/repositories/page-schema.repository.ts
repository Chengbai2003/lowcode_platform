import { ConflictException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface PageRecord {
  id: string;
  currentVersion: number;
  latestSnapshotId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PageSchemaSnapshotRecord {
  id: string;
  pageId: string;
  version: number;
  schema: Record<string, unknown>;
  createdAt: string;
}

interface PageSchemaStore {
  pages: PageRecord[];
  snapshots: PageSchemaSnapshotRecord[];
}

@Injectable()
export class PageSchemaRepository implements OnModuleInit {
  private readonly logger = new Logger(PageSchemaRepository.name);
  private readonly storeFilePath =
    process.env.PAGE_SCHEMA_FILE_PATH || path.resolve(process.cwd(), 'page-schema-store.json');

  private pages = new Map<string, PageRecord>();
  private snapshots: PageSchemaSnapshotRecord[] = [];

  // static lock 仅保证单进程多实例，多进程需 DB 事务（如 SELECT FOR UPDATE）。
  private static readonly writeTails = new Map<string, Promise<void>>();

  async onModuleInit(): Promise<void> {
    await this.enqueue(async () => {
      const loaded = await this.loadStoreFromDisk();
      this.pages = loaded.pages;
      this.snapshots = loaded.snapshots;
    });
  }

  getPage(pageId: string): PageRecord | undefined {
    return this.pages.get(pageId);
  }

  getLatestSnapshot(pageId: string): PageSchemaSnapshotRecord | undefined {
    const page = this.getPage(pageId);
    if (!page) {
      return undefined;
    }
    return this.snapshots.find((snapshot) => snapshot.id === page.latestSnapshotId);
  }

  getSnapshotByVersion(pageId: string, version: number): PageSchemaSnapshotRecord | undefined {
    return this.snapshots.find(
      (snapshot) => snapshot.pageId === pageId && snapshot.version === version,
    );
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const key = path.resolve(this.storeFilePath);
    const prevTail = PageSchemaRepository.writeTails.get(key) ?? Promise.resolve();
    const result = prevTail.then(task, task);
    const tail: Promise<void> = result.then(
      () => undefined,
      () => undefined,
    );
    PageSchemaRepository.writeTails.set(key, tail);
    tail.finally(() => {
      if (PageSchemaRepository.writeTails.get(key) === tail) {
        PageSchemaRepository.writeTails.delete(key);
      }
    });
    return result;
  }

  async saveSchema(params: {
    pageId: string;
    schema: Record<string, unknown>;
    baseVersion?: number;
  }): Promise<{ page: PageRecord; snapshot: PageSchemaSnapshotRecord }> {
    return this.enqueue(async () => {
      // 重读磁盘最新 store，保证锁内闭环
      const disk = await this.loadStoreFromDisk();
      const existing = disk.pages.get(params.pageId);
      const currentVersion = existing?.currentVersion ?? 0;

      if (existing && params.baseVersion === undefined) {
        throw new ConflictException({
          message: 'Page version mismatch',
          pageId: params.pageId,
          expectedVersion: currentVersion,
          receivedVersion: null,
        });
      }
      if (params.baseVersion !== undefined && params.baseVersion !== currentVersion) {
        throw new ConflictException({
          message: 'Page version mismatch',
          pageId: params.pageId,
          expectedVersion: currentVersion,
          receivedVersion: params.baseVersion,
        });
      }

      const nextVersion = currentVersion + 1;
      const savedAt = new Date().toISOString();
      const snapshotId = crypto.randomUUID();
      const normalizedSchema = { ...params.schema, version: nextVersion };

      const snapshot: PageSchemaSnapshotRecord = {
        id: snapshotId,
        pageId: params.pageId,
        version: nextVersion,
        schema: normalizedSchema,
        createdAt: savedAt,
      };

      const page: PageRecord = {
        id: params.pageId,
        currentVersion: nextVersion,
        latestSnapshotId: snapshotId,
        createdAt: existing?.createdAt || savedAt,
        updatedAt: savedAt,
      };

      // 用全新 Map/数组构造 next state
      const nextPages = new Map(disk.pages);
      const nextSnapshots = [...disk.snapshots, snapshot];
      nextPages.set(params.pageId, page);

      const store: PageSchemaStore = {
        pages: Array.from(nextPages.values()),
        snapshots: nextSnapshots,
      };

      await this.persistStore(store);

      // rename 成功后才替换内存（失败自动回滚，保持旧状态）
      this.pages = nextPages;
      this.snapshots = nextSnapshots;

      return { page, snapshot };
    });
  }

  private async loadStoreFromDisk(): Promise<{
    pages: Map<string, PageRecord>;
    snapshots: PageSchemaSnapshotRecord[];
  }> {
    if (!fs.existsSync(this.storeFilePath)) {
      return { pages: new Map(), snapshots: [] };
    }
    const content = await fs.promises.readFile(this.storeFilePath, 'utf-8');
    if (!content.trim()) {
      throw new Error('Page schema store is empty');
    }
    let parsed: Partial<PageSchemaStore>;
    try {
      parsed = JSON.parse(content) as Partial<PageSchemaStore>;
    } catch {
      throw new Error('Page schema store is corrupted: invalid JSON');
    }
    if (!Array.isArray(parsed.pages)) {
      throw new Error('Page schema store is corrupted: pages must be an array');
    }
    if (!Array.isArray(parsed.snapshots)) {
      throw new Error('Page schema store is corrupted: snapshots must be an array');
    }
    for (const p of parsed.pages as PageRecord[]) {
      if (!Number.isInteger(p.currentVersion)) {
        throw new Error(`Page ${p.id} version must be an integer`);
      }
    }
    for (const s of parsed.snapshots as PageSchemaSnapshotRecord[]) {
      if (!Number.isInteger(s.version)) {
        throw new Error(`Snapshot ${s.id} version must be an integer`);
      }
    }
    const snapshotIds = new Set((parsed.snapshots as PageSchemaSnapshotRecord[]).map((s) => s.id));
    for (const p of parsed.pages as PageRecord[]) {
      if (!snapshotIds.has(p.latestSnapshotId)) {
        throw new Error(`Page ${p.id} latestSnapshotId ${p.latestSnapshotId} is dangling`);
      }
    }
    return {
      pages: new Map((parsed.pages as PageRecord[]).map((p) => [p.id, p])),
      snapshots: parsed.snapshots as PageSchemaSnapshotRecord[],
    };
  }

  private async persistStore(store: PageSchemaStore): Promise<void> {
    const content = JSON.stringify(store, null, 2);
    const tmpPath = `${this.storeFilePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;

    try {
      await fs.promises.mkdir(path.dirname(this.storeFilePath), { recursive: true });
    } catch {
      // ignore mkdir errors
    }

    await fs.promises.writeFile(tmpPath, content, 'utf-8');

    try {
      const handle = await fs.promises.open(tmpPath, 'r');
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
    } catch {
      // fsync best-effort
    }

    try {
      await fs.promises.rename(tmpPath, this.storeFilePath);
    } catch (error) {
      try {
        await fs.promises.unlink(tmpPath);
      } catch {
        // ignore cleanup
      }
      this.logger.error('Failed to atomically rename page schema store', error);
      throw error;
    }
  }
}
