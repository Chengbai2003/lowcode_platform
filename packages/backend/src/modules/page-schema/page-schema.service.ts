import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MAX_SCHEMA_SIZE_BYTES, SavePageSchemaDto } from './dto/save-page-schema.dto';
import {
  PageRecord,
  PageSchemaRepository,
  PageSchemaSnapshotRecord,
} from './repositories/page-schema.repository';

interface A2UIComponentShape {
  id?: string;
  type?: string;
  props?: Record<string, unknown>;
  childrenIds?: unknown[];
  events?: Record<string, unknown>;
}

interface A2UISchemaShape {
  rootId: string;
  components: Record<string, A2UIComponentShape>;
}

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
    this.assertValidSchema(dto.schema);

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

  private assertValidSchema(schema: unknown): asserts schema is A2UISchemaShape {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
      throw new BadRequestException('Schema must be an object');
    }

    const serialized = JSON.stringify(schema);
    if (Buffer.byteLength(serialized, 'utf-8') > MAX_SCHEMA_SIZE_BYTES) {
      throw new BadRequestException(`Schema must not exceed ${MAX_SCHEMA_SIZE_BYTES} bytes`);
    }

    const typedSchema = schema as Partial<A2UISchemaShape>;
    const rootId = typedSchema.rootId;
    const components = typedSchema.components;

    if (typeof rootId !== 'string' || !rootId.trim()) {
      throw new BadRequestException('Schema rootId is required');
    }

    if (!components || typeof components !== 'object' || Array.isArray(components)) {
      throw new BadRequestException('Schema components must be an object');
    }

    if (!(rootId in components)) {
      throw new BadRequestException(`Schema rootId ${rootId} does not exist in components`);
    }

    for (const [componentId, component] of Object.entries(components)) {
      if (!component || typeof component !== 'object' || Array.isArray(component)) {
        throw new BadRequestException(`Component ${componentId} must be an object`);
      }

      const typedComponent = component as A2UIComponentShape;
      if (typeof typedComponent.type !== 'string' || !typedComponent.type.trim()) {
        throw new BadRequestException(`Component ${componentId} type is required`);
      }

      if (typedComponent.id !== undefined && typedComponent.id !== componentId) {
        throw new BadRequestException(
          `Component ${componentId} id must match its key when provided`,
        );
      }

      if (typedComponent.childrenIds !== undefined && !Array.isArray(typedComponent.childrenIds)) {
        throw new BadRequestException(`Component ${componentId} childrenIds must be an array`);
      }

      if (Array.isArray(typedComponent.childrenIds)) {
        for (const childId of typedComponent.childrenIds) {
          if (typeof childId !== 'string' || !(childId in components)) {
            throw new BadRequestException(
              `Component ${componentId} references missing child ${String(childId)}`,
            );
          }
        }
      }
    }
  }
}
