import { BadRequestException, Injectable } from '@nestjs/common';
import { PageSchemaService } from '../page-schema/page-schema.service';
import { A2UISchema } from './types/schema.types';

@Injectable()
export class SchemaResolverService {
  constructor(private readonly pageSchemaService: PageSchemaService) {}

  async resolve(input: {
    pageId?: string;
    version?: number;
    draftSchema?: Record<string, unknown>;
  }): Promise<A2UISchema> {
    let raw: Record<string, unknown>;

    if (input.draftSchema) {
      raw = input.draftSchema;
    } else if (input.pageId) {
      const page = await this.pageSchemaService.getSchema(input.pageId, input.version);
      raw = page.schema;
    } else {
      throw new BadRequestException('Either draftSchema or pageId must be provided');
    }

    return this.assertAndCast(raw);
  }

  private assertAndCast(raw: Record<string, unknown>): A2UISchema {
    const rootId = raw.rootId;
    if (typeof rootId !== 'string' || !rootId.trim()) {
      throw new BadRequestException('Schema rootId is required and must be a non-empty string');
    }

    const components = raw.components;
    if (!components || typeof components !== 'object' || Array.isArray(components)) {
      throw new BadRequestException('Schema components must be an object');
    }

    if (!(rootId in (components as Record<string, unknown>))) {
      throw new BadRequestException(`Schema rootId "${rootId}" does not exist in components`);
    }

    const comps = components as Record<string, unknown>;
    for (const [id, entry] of Object.entries(comps)) {
      this.assertComponent(id, entry);
    }

    const cloned = structuredClone(raw) as unknown as A2UISchema;
    return cloned;
  }

  private assertComponent(id: string, entry: unknown): void {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new BadRequestException(`Component "${id}" must be an object`);
    }

    const comp = entry as Record<string, unknown>;

    if (typeof comp.id !== 'string' || !comp.id.trim()) {
      throw new BadRequestException(`Component "${id}" must have a non-empty string "id"`);
    }

    if (comp.id !== id) {
      throw new BadRequestException(`Component "${id}" has mismatched id "${String(comp.id)}"`);
    }

    if (typeof comp.type !== 'string' || !comp.type.trim()) {
      throw new BadRequestException(`Component "${id}" must have a non-empty string "type"`);
    }

    if (
      comp.props !== undefined &&
      (!comp.props || typeof comp.props !== 'object' || Array.isArray(comp.props))
    ) {
      throw new BadRequestException(`Component "${id}".props must be an object if present`);
    }

    if (
      comp.events !== undefined &&
      (!comp.events || typeof comp.events !== 'object' || Array.isArray(comp.events))
    ) {
      throw new BadRequestException(`Component "${id}".events must be an object if present`);
    }

    if (comp.childrenIds !== undefined) {
      if (!Array.isArray(comp.childrenIds)) {
        throw new BadRequestException(`Component "${id}".childrenIds must be an array if present`);
      }

      for (const childId of comp.childrenIds) {
        if (typeof childId !== 'string' || !childId.trim()) {
          throw new BadRequestException(
            `Component "${id}".childrenIds must only contain non-empty strings`,
          );
        }
      }
    }
  }
}
