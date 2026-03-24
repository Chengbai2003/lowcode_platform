import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
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

  async saveSnapshot(snapshot: PageSchemaSnapshotRecord, page: PageRecord): Promise<void> {
    const existingIndex = this.snapshots.findIndex((item) => item.id === snapshot.id);
    if (existingIndex >= 0) {
      this.snapshots[existingIndex] = snapshot;
    } else {
      this.snapshots.push(snapshot);
    }

    this.pages.set(page.id, page);
    await this.saveStore();
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

    await fs.promises.writeFile(this.storeFilePath, JSON.stringify(store, null, 2), 'utf-8');
  }
}
