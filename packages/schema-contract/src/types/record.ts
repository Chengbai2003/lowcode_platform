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
 * 对外 API 返回与前后端共享的页面文档传输模型 (PageDocument)
 */
export interface PageDocument {
  readonly pageId: string;
  readonly pageVersion: number;
  readonly snapshotId: string;
  readonly runtimeCompatibility: RuntimeCompatibility;
  readonly schema: PageSchema;
  readonly savedAt: string;
}
