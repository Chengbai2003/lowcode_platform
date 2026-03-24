import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { SavePageSchemaDto } from './dto/save-page-schema.dto';
import {
  PageRecord,
  PageSchemaRepository,
  PageSchemaSnapshotRecord,
} from './repositories/page-schema.repository';
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

  async saveSchema(pageId: string, dto: SavePageSchemaDto): Promise<SavedPageSchemaResult> {
    assertValidPageSchema(dto.schema);

    const existingPage = this.repository.getPage(pageId);
    const currentVersion = existingPage?.currentVersion ?? 0;

    if (existingPage && dto.baseVersion === undefined) {
      throw new ConflictException({
        message: 'Page version mismatch',
        pageId,
        expectedVersion: currentVersion,
        receivedVersion: null,
      });
    }

    if (dto.baseVersion !== undefined && dto.baseVersion !== currentVersion) {
      throw new ConflictException({
        message: 'Page version mismatch',
        pageId,
        expectedVersion: currentVersion,
        receivedVersion: dto.baseVersion,
      });
    }

    const nextVersion = currentVersion + 1;
    const savedAt = new Date().toISOString();
    const snapshotId = `${pageId}-v${nextVersion}-${Date.now()}`;
    const normalizedSchema = this.withSchemaVersion(dto.schema, nextVersion);
    const snapshot: PageSchemaSnapshotRecord = {
      id: snapshotId,
      pageId,
      version: nextVersion,
      schema: normalizedSchema,
      createdAt: savedAt,
    };

    const page: PageRecord = {
      id: pageId,
      currentVersion: nextVersion,
      latestSnapshotId: snapshotId,
      createdAt: existingPage?.createdAt || savedAt,
      updatedAt: savedAt,
    };

    await this.repository.saveSnapshot(snapshot, page);

    return {
      pageId,
      version: nextVersion,
      snapshotId,
      savedAt,
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
