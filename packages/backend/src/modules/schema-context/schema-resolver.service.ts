import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { PageSchemaService } from '../page-schema/page-schema.service';
import {
  PageSchema,
  ComponentNode,
  type RuntimeCompatibility,
} from '@lowcode-platform/schema-contract';
import {
  DEPLOYMENT_RUNTIME_PROFILE_REGISTRY,
  DeploymentRuntimeProfileRegistry,
} from '../runtime-profile/deployment-runtime-profile-registry';
import { toRuntimeCompatibility } from '../page-schema/system-runtime-profile';

export interface ResolvedSchemaContext {
  schema: PageSchema;
  runtimeCompatibility: RuntimeCompatibility;
}

@Injectable()
export class SchemaResolverService {
  private readonly deploymentRegistry: DeploymentRuntimeProfileRegistry;

  constructor(
    private readonly pageSchemaService: PageSchemaService,
    @Optional() deploymentRegistry?: DeploymentRuntimeProfileRegistry,
  ) {
    this.deploymentRegistry = deploymentRegistry ?? DEPLOYMENT_RUNTIME_PROFILE_REGISTRY;
  }

  async resolve(input: {
    pageId?: string;
    pageVersion?: number;
    draftSchema?: Record<string, unknown>;
  }): Promise<PageSchema> {
    const result = await this.resolveWithCompatibility(input);
    return result.schema;
  }

  async resolveWithCompatibility(input: {
    pageId?: string;
    pageVersion?: number;
    draftSchema?: Record<string, unknown>;
  }): Promise<ResolvedSchemaContext> {
    let raw: Record<string, unknown>;
    let runtimeCompatibility: RuntimeCompatibility;

    if (input.pageId) {
      // 已有 pageId：对应真实服务端快照，查询失败不降级为默认草稿
      const page = await this.pageSchemaService.getSchema(input.pageId, input.pageVersion);
      // 消费前校验（disabled / unknown / mismatch 拒绝）
      this.deploymentRegistry.resolveSnapshot(page.runtimeCompatibility);
      runtimeCompatibility = page.runtimeCompatibility;

      if (input.draftSchema) {
        // draftSchema 只替换待编辑内容，不改变页面运行时身份
        raw = input.draftSchema;
      } else {
        raw = page.schema as unknown as Record<string, unknown>;
      }
    } else if (input.draftSchema) {
      // 真正尚未保存的 draft：沿用服务端默认系统 active Profile
      const profile = this.deploymentRegistry.resolveSystem('default');
      runtimeCompatibility = toRuntimeCompatibility(profile);
      raw = input.draftSchema;
    } else {
      throw new BadRequestException('Either draftSchema or pageId must be provided');
    }

    const schema = this.assertAndCast(raw);
    return { schema, runtimeCompatibility };
  }

  private assertAndCast(raw: Record<string, unknown>): PageSchema {
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

    const cloned = structuredClone(raw) as unknown as PageSchema;
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
