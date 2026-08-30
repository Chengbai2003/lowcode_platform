import { ConflictException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { PageSchema, RuntimeCompatibility } from '@lowcode-platform/schema-contract';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 页面指针记录：只保存版本指针，不保存 Schema 本体。
 * Schema 只存在于不可变快照（PageSnapshotRecord）中。
 */
export interface StoredPageRecord {
  pageId: string;
  currentPageVersion: number;
  latestSnapshotId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 不可变页面快照：Schema 为经过 Contract 校验的 canonical 纯数据对象，
 * 附加保存精确复现该页面所需的运行时元数据。
 */
export interface PageSnapshotRecord {
  snapshotId: string;
  pageId: string;
  pageVersion: number;
  schema: PageSchema;
  runtimeCompatibility: RuntimeCompatibility;
  createdAt: string;
}

interface PageSchemaStore {
  pages: StoredPageRecord[];
  snapshots: PageSnapshotRecord[];
}

@Injectable()
export class PageSchemaRepository implements OnModuleInit {
  private readonly logger = new Logger(PageSchemaRepository.name);
  private readonly storeFilePath =
    process.env.PAGE_SCHEMA_FILE_PATH || path.resolve(process.cwd(), 'page-schema-store.json');

  private pages = new Map<string, StoredPageRecord>();
  private snapshots: PageSnapshotRecord[] = [];

  // static lock 仅保证单进程多实例，多进程需 DB 事务（如 SELECT FOR UPDATE）。
  private static readonly writeTails = new Map<string, Promise<void>>();

  async onModuleInit(): Promise<void> {
    await this.enqueue(async () => {
      const loaded = await this.loadStoreFromDisk();
      this.pages = loaded.pages;
      this.snapshots = loaded.snapshots;
    });
  }

  getPage(pageId: string): StoredPageRecord | undefined {
    return this.pages.get(pageId);
  }

  getLatestSnapshot(pageId: string): PageSnapshotRecord | undefined {
    const page = this.getPage(pageId);
    if (!page) {
      return undefined;
    }
    return this.snapshots.find((snapshot) => snapshot.snapshotId === page.latestSnapshotId);
  }

  getSnapshotByVersion(pageId: string, pageVersion: number): PageSnapshotRecord | undefined {
    return this.snapshots.find(
      (snapshot) => snapshot.pageId === pageId && snapshot.pageVersion === pageVersion,
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
    schema: PageSchema;
    baseVersion?: number;
    runtimeCompatibility: RuntimeCompatibility;
  }): Promise<{ page: StoredPageRecord; snapshot: PageSnapshotRecord }> {
    return this.enqueue(async () => {
      // 重读磁盘最新 store，保证锁内闭环
      const disk = await this.loadStoreFromDisk();
      const existing = disk.pages.get(params.pageId);
      const currentPageVersion = existing?.currentPageVersion ?? 0;

      if (existing && params.baseVersion === undefined) {
        throw new ConflictException({
          message: 'Page version mismatch',
          pageId: params.pageId,
          expectedVersion: currentPageVersion,
          receivedVersion: null,
        });
      }
      if (params.baseVersion !== undefined && params.baseVersion !== currentPageVersion) {
        throw new ConflictException({
          message: 'Page version mismatch',
          pageId: params.pageId,
          expectedVersion: currentPageVersion,
          receivedVersion: params.baseVersion,
        });
      }

      const nextPageVersion = currentPageVersion + 1;
      const savedAt = new Date().toISOString();
      const snapshotId = crypto.randomUUID();

      // Schema 保持 Service 层传入的 canonical 纯数据对象原样保存，
      // 页面版本只存在于存储元数据，绝不写入 Schema。
      const snapshot: PageSnapshotRecord = {
        snapshotId,
        pageId: params.pageId,
        pageVersion: nextPageVersion,
        schema: params.schema,
        runtimeCompatibility: params.runtimeCompatibility,
        createdAt: savedAt,
      };

      const page: StoredPageRecord = {
        pageId: params.pageId,
        currentPageVersion: nextPageVersion,
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
    pages: Map<string, StoredPageRecord>;
    snapshots: PageSnapshotRecord[];
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

    // 存储字段已重命名（id→pageId、currentVersion→currentPageVersion、id→snapshotId、
    // version→pageVersion）。旧格式 store 不做静默迁移，直接给出明确清理指引。
    const looksLikeLegacyStore = (parsed.pages as unknown as Array<Record<string, unknown>>).some(
      (p) => p && typeof p === 'object' && 'id' in p && !('pageId' in p),
    );
    if (looksLikeLegacyStore) {
      throw new Error(
        'Page schema store uses the legacy pre-M0-1 format. ' +
          'Delete the store file (page-schema-store.json) or migrate it manually; ' +
          'legacy data is never rewritten silently.',
      );
    }

    for (const p of parsed.pages as StoredPageRecord[]) {
      if (typeof p.pageId !== 'string') {
        throw new Error('Page schema store is corrupted: pages[].pageId must be a string');
      }
      if (!Number.isInteger(p.currentPageVersion)) {
        throw new Error(`Page ${p.pageId} currentPageVersion must be an integer`);
      }
    }
    for (const s of parsed.snapshots as PageSnapshotRecord[]) {
      if (typeof s.snapshotId !== 'string') {
        throw new Error('Page schema store is corrupted: snapshots[].snapshotId must be a string');
      }
      if (!Number.isInteger(s.pageVersion)) {
        throw new Error(`Snapshot ${s.snapshotId} pageVersion must be an integer`);
      }
    }
    const snapshotIds = new Set(
      (parsed.snapshots as PageSnapshotRecord[]).map((s) => s.snapshotId),
    );
    for (const p of parsed.pages as StoredPageRecord[]) {
      if (!snapshotIds.has(p.latestSnapshotId)) {
        throw new Error(`Page ${p.pageId} latestSnapshotId ${p.latestSnapshotId} is dangling`);
      }
    }
    return {
      pages: new Map((parsed.pages as StoredPageRecord[]).map((p) => [p.pageId, p])),
      snapshots: parsed.snapshots as PageSnapshotRecord[],
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
