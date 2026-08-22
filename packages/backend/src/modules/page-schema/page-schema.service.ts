import { Injectable, NotFoundException } from '@nestjs/common';
import { PageSchemaRepository } from './repositories/page-schema.repository';
import { assertValidPageSchema } from './schema-validation';

export interface SavedPageSchemaResult {
  pageId: string;
  version: number;
  snapshotId: string;
  savedAt: string;
}

export interface LoadedPageSchemaResult extends SavedPageSchemaResult {
  schema: Record<string, unknown>;
}

@Injectable()
export class PageSchemaService {
  constructor(private readonly repository: PageSchemaRepository) {}

  async saveSchema(params: {
    pageId: string;
    schema: Record<string, unknown>;
    baseVersion?: number;
  }): Promise<SavedPageSchemaResult> {
    assertValidPageSchema(params.schema);

    const { page, snapshot } = await this.repository.saveSchema({
      pageId: params.pageId,
      schema: params.schema,
      baseVersion: params.baseVersion,
    });

    return {
      pageId: page.id,
      version: page.currentVersion,
      snapshotId: snapshot.id,
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
      version: snapshot.version,
      snapshotId: snapshot.id,
      schema: this.withSchemaVersion(snapshot.schema, snapshot.version),
      savedAt: snapshot.createdAt,
    };
  }

  private withSchemaVersion(
    schema: Record<string, unknown>,
    version: number,
  ): Record<string, unknown> {
    return {
      ...schema,
      version,
    };
  }
}
