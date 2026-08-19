import { ConflictException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
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

  private saveQueue: Promise<void> = Promise.resolve();

  onModuleInit() {
    this.loadStore();
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
    const result = this.saveQueue.then(task, task);
    // Ensure queue continues even if task rejects
    this.saveQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async saveSnapshot(snapshot: PageSchemaSnapshotRecord, page: PageRecord): Promise<void> {
    return this.enqueue(async () => {
      const existing = this.pages.get(page.id);
      const currentVersion = existing?.currentVersion ?? 0;
      // Atomic version check inside critical section: snapshot must be exactly next version
      if (snapshot.version !== currentVersion + 1) {
        // If page already exists with different version, treat as conflict
        // For brand new page, currentVersion 0 -> expected snapshot.version 1
        throw new ConflictException({
          message: 'Page version mismatch',
          pageId: page.id,
          expectedVersion: currentVersion,
          receivedVersion: snapshot.version - 1,
        });
      }

      const existingIndex = this.snapshots.findIndex((item) => item.id === snapshot.id);
      if (existingIndex >= 0) {
        this.snapshots[existingIndex] = snapshot;
      } else {
        this.snapshots.push(snapshot);
      }

      this.pages.set(page.id, page);
      await this.saveStore();
    });
  }

  /**
   * Atomic save with explicit expectedVersion check inside the same critical section.
   * This ensures version check and write are serialized via the global queue,
   * preventing lost-update race conditions.
   */
  async saveSnapshotWithVersionCheck(
    snapshot: PageSchemaSnapshotRecord,
    page: PageRecord,
    expectedVersion: number | undefined,
  ): Promise<void> {
    return this.enqueue(async () => {
      const existing = this.pages.get(page.id);
      const currentVersion = existing?.currentVersion ?? 0;

      if (existing && expectedVersion === undefined) {
        throw new ConflictException({
          message: 'Page version mismatch',
          pageId: page.id,
          expectedVersion: currentVersion,
          receivedVersion: null,
        });
      }

      if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
        throw new ConflictException({
          message: 'Page version mismatch',
          pageId: page.id,
          expectedVersion: currentVersion,
          receivedVersion: expectedVersion,
        });
      }

      if (snapshot.version !== currentVersion + 1) {
        throw new ConflictException({
          message: 'Page version mismatch',
          pageId: page.id,
          expectedVersion: currentVersion,
          receivedVersion: snapshot.version - 1,
        });
      }

      const existingIndex = this.snapshots.findIndex((item) => item.id === snapshot.id);
      if (existingIndex >= 0) {
        this.snapshots[existingIndex] = snapshot;
      } else {
        this.snapshots.push(snapshot);
      }

      this.pages.set(page.id, page);
      await this.saveStore();
    });
  }

  // Alias for spec naming variants
  async saveWithConflictCheck(
    pageId: string,
    expectedVersion: number | undefined,
    snapshot: PageSchemaSnapshotRecord,
    page: PageRecord,
  ): Promise<void> {
    return this.saveSnapshotWithVersionCheck(snapshot, page, expectedVersion);
  }

  async trySaveWithVersionCheck(
    snapshot: PageSchemaSnapshotRecord,
    page: PageRecord,
    expectedVersion: number | undefined,
  ): Promise<void> {
    return this.saveSnapshotWithVersionCheck(snapshot, page, expectedVersion);
  }

  private loadStore() {
    try {
      if (!fs.existsSync(this.storeFilePath)) {
        void this.saveStore().catch((error) => {
          this.logger.error('Failed to initialize page schema store', error);
        });
        return;
      }

      const content = fs.readFileSync(this.storeFilePath, 'utf-8');
      if (!content.trim()) {
        void this.saveStore().catch((error) => {
          this.logger.error('Failed to initialize empty page schema store', error);
        });
        return;
      }

      const parsed = JSON.parse(content) as Partial<PageSchemaStore>;
      const pages = Array.isArray(parsed.pages) ? parsed.pages : [];
      const snapshots = Array.isArray(parsed.snapshots) ? parsed.snapshots : [];

      this.pages = new Map(pages.map((page) => [page.id, page]));
      this.snapshots = snapshots;
    } catch (error) {
      this.logger.error('Failed to load page schema store', error);
      this.pages.clear();
      this.snapshots = [];
    }
  }

  private async saveStore() {
    const store: PageSchemaStore = {
      pages: Array.from(this.pages.values()),
      snapshots: this.snapshots,
    };

    const content = JSON.stringify(store, null, 2);
    const tmpPath = `${this.storeFilePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;

    try {
      await fs.promises.mkdir(path.dirname(this.storeFilePath), { recursive: true });
    } catch {
      // ignore mkdir errors, write will fail if directory unavailable
    }

    await fs.promises.writeFile(tmpPath, content, 'utf-8');

    // Best-effort fsync for durability before rename
    try {
      const handle = await fs.promises.open(tmpPath, 'r');
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
    } catch {
      // fsync is best-effort; ignore errors on platforms that don't support it
    }

    try {
      await fs.promises.rename(tmpPath, this.storeFilePath);
    } catch (error) {
      // Cleanup temp file on failure
      try {
        await fs.promises.unlink(tmpPath);
      } catch {
        // ignore cleanup errors
      }
      this.logger.error('Failed to atomically rename page schema store', error);
      throw error;
    }
  }
}
