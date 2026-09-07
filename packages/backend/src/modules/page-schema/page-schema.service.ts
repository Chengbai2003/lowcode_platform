import { Injectable, NotFoundException } from '@nestjs/common';
import type { PageSchema, RuntimeCompatibility } from '@lowcode-platform/schema-contract';
import { PageSchemaRepository } from './repositories/page-schema.repository';
import { requireValidPageSchema } from './schema-validation';
import {
  PageRuntimeMetadataProvider,
  type PageRuntimeMetadata,
} from './page-runtime-metadata.provider';

export interface SavedPageSchemaResult {
  pageId: string;
  /** 页面内容修订版本（存储元数据） */
  pageVersion: number;
  snapshotId: string;
  savedAt: string;
}

export interface LoadedPageSchemaResult extends SavedPageSchemaResult {
  /** canonical 纯 Schema：不含任何页面版本字段（schemaVersion 只描述 DSL 格式） */
  schema: PageSchema;
  runtimeCompatibility: RuntimeCompatibility;
}

@Injectable()
export class PageSchemaService {
  constructor(
    private readonly repository: PageSchemaRepository,
    private readonly runtimeMetadataProvider: PageRuntimeMetadataProvider,
  ) {}

  async saveSchema(params: {
    pageId: string;
    schema: unknown;
    basePageVersion?: number;
  }): Promise<SavedPageSchemaResult> {
    // 校验并取回 canonical 深冻结对象；后续只保存/消费该返回值，
    // 原始输入对象即使在校验后被变异也不会影响存储内容。
    const canonicalSchema = requireValidPageSchema(params.schema);

    const existingPage = this.repository.getPage(params.pageId);
    let runtimeMetadata: PageRuntimeMetadata;

    if (!existingPage) {
      // 1. 新页面：服务端选择默认系统（'default'）的 active Profile
      runtimeMetadata = this.runtimeMetadataProvider.resolveSystemRuntimeMetadata('default');
    } else {
      // 2. 已有页面：获取当前快照的三元组与 systemId
      const latestSnapshot = this.repository.getLatestSnapshot(params.pageId);
      if (!latestSnapshot) {
        throw new NotFoundException(
          `Corrupted page state: page ${params.pageId} has no schema snapshot`,
        );
      }
      // 精确解析并验证（active 允许；deprecated 保持已有绑定允许；disabled / unknown / mismatch 拒绝）
      runtimeMetadata = this.runtimeMetadataProvider.resolveExistingPageRuntimeMetadata(
        existingPage.systemId,
        latestSnapshot.runtimeCompatibility,
      );
    }

    const { page, snapshot } = await this.repository.saveSchema({
      pageId: params.pageId,
      schema: canonicalSchema,
      basePageVersion: params.basePageVersion,
      systemId: runtimeMetadata.systemId,
      runtimeCompatibility: runtimeMetadata.runtimeCompatibility,
    });

    return {
      pageId: page.pageId,
      pageVersion: page.currentPageVersion,
      snapshotId: snapshot.snapshotId,
      savedAt: snapshot.createdAt,
    };
  }

  async getSchema(pageId: string, pageVersion?: number): Promise<LoadedPageSchemaResult> {
    const page = this.repository.getPage(pageId);
    if (!page) {
      throw new NotFoundException(`Page ${pageId} not found`);
    }

    const snapshot = pageVersion
      ? this.repository.getSnapshotByVersion(pageId, pageVersion)
      : this.repository.getLatestSnapshot(pageId);

    if (!snapshot) {
      if (pageVersion) {
        throw new NotFoundException(`Page ${pageId} pageVersion ${pageVersion} not found`);
      }
      throw new NotFoundException(`Page ${pageId} has no schema snapshot`);
    }

    return {
      pageId,
      pageVersion: snapshot.pageVersion,
      snapshotId: snapshot.snapshotId,
      schema: snapshot.schema,
      runtimeCompatibility: snapshot.runtimeCompatibility,
      savedAt: snapshot.createdAt,
    };
  }
}
