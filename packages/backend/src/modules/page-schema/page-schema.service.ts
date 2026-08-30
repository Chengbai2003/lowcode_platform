import { Injectable, NotFoundException } from '@nestjs/common';
import type { PageSchema, RuntimeCompatibility } from '@lowcode-platform/schema-contract';
import { PageSchemaRepository } from './repositories/page-schema.repository';
import { requireValidPageSchema } from './schema-validation';
import { PageRuntimeMetadataProvider } from './page-runtime-metadata.provider';

export interface SavedPageSchemaResult {
  pageId: string;
  /** 页面内容修订版本（存储元数据；PR 3 起协议字段更名为 pageVersion） */
  version: number;
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
    baseVersion?: number;
  }): Promise<SavedPageSchemaResult> {
    // 校验并取回 canonical 深冻结对象；后续只保存/消费该返回值，
    // 原始输入对象即使在校验后被变异也不会影响存储内容。
    const canonicalSchema = requireValidPageSchema(params.schema);

    const { page, snapshot } = await this.repository.saveSchema({
      pageId: params.pageId,
      schema: canonicalSchema,
      baseVersion: params.baseVersion,
      runtimeCompatibility: this.runtimeMetadataProvider.getDraftRuntimeCompatibility(),
    });

    return {
      pageId: page.pageId,
      version: page.currentPageVersion,
      snapshotId: snapshot.snapshotId,
      savedAt: snapshot.createdAt,
    };
  }

  async getSchema(pageId: string, version?: number): Promise<LoadedPageSchemaResult> {
    const page = this.repository.getPage(pageId);
    if (!page) {
      throw new NotFoundException(`Page ${pageId} not found`);
    }

    const snapshot = version
      ? this.repository.getSnapshotByVersion(pageId, version)
      : this.repository.getLatestSnapshot(pageId);

    if (!snapshot) {
      if (version) {
        throw new NotFoundException(`Page ${pageId} version ${version} not found`);
      }
      throw new NotFoundException(`Page ${pageId} has no schema snapshot`);
    }

    return {
      pageId,
      version: snapshot.pageVersion,
      snapshotId: snapshot.snapshotId,
      schema: snapshot.schema,
      runtimeCompatibility: snapshot.runtimeCompatibility,
      savedAt: snapshot.createdAt,
    };
  }
}
