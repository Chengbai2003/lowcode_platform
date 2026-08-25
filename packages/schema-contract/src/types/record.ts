import type { PageSchema } from './schema';

/**
 * 运行时兼容元数据（由服务端根据 systemProfile 提供）
 */
export interface RuntimeCompatibility {
  readonly componentPresetId: string;
  readonly componentPresetVersion: string;
  readonly rendererVersion: string;
}

/**
 * 页面数据库记录/指针 (StoredPageRecord)
 * 不直接存储 Schema，指向 latestSnapshotId
 */
export interface StoredPageRecord {
  readonly pageId: string;
  readonly systemId: string;
  readonly currentPageVersion: number;
  readonly latestSnapshotId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * 页面不可变快照记录 (PageSnapshotRecord)
 */
export interface PageSnapshotRecord {
  readonly snapshotId: string;
  readonly pageId: string;
  readonly pageVersion: number;
  readonly runtimeCompatibility: RuntimeCompatibility;
  readonly schema: PageSchema;
  readonly createdAt: string;
}

/**
 * 对外 API 返回模型 (PageDocument)
 */
export interface PageDocument {
  readonly pageId: string;
  readonly pageVersion: number;
  readonly snapshotId: string;
  readonly runtimeCompatibility: RuntimeCompatibility;
  readonly schema: PageSchema;
  readonly savedAt: string;
}
