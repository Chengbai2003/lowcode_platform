import { Injectable } from '@nestjs/common';
import { ComponentMetaRegistry } from '../schema-context/component-metadata/component-meta.registry';
import {
  PageSchema,
  ComponentNode,
  requireSupportedPageSchema,
  SchemaValidationError,
} from '@lowcode-platform/schema-contract';
import { getActionValidationError, hasCustomScriptInValue } from '../page-schema/action-validation';
import { AgentToolException } from './agent-tool.exception';
import { PatchApplyService } from './patch-apply.service';
import { EditorPatchOperation } from './types/editor-patch.types';

@Injectable()
export class PatchValidationService {
  constructor(
    private readonly metaRegistry: ComponentMetaRegistry,
    private readonly patchApplyService: PatchApplyService,
  ) {}

  validatePatchShape(patch: readonly EditorPatchOperation[], traceId: string) {
    for (const operation of patch) {
      switch (operation.op) {
        case 'insertComponent':
          if (!operation.parentId) {
            throw new AgentToolException({
              code: 'PATCH_INVALID',
              message: 'insertComponent requires parentId',
              traceId,
            });
          }
          if (!operation.component || typeof operation.component !== 'object') {
            throw new AgentToolException({
              code: 'PATCH_INVALID',
              message: 'insertComponent requires component',
              traceId,
            });
          }
          break;
        case 'updateProps':
          if (!operation.componentId || !operation.props) {
            throw new AgentToolException({
              code: 'PATCH_INVALID',
              message: 'updateProps requires componentId and props',
              traceId,
            });
          }
          break;
        case 'bindEvent':
          if (!operation.componentId || !operation.event || !Array.isArray(operation.actions)) {
            throw new AgentToolException({
              code: 'PATCH_INVALID',
              message: 'bindEvent requires componentId, event and actions',
              traceId,
            });
          }
          break;
        case 'removeComponent':
          if (!operation.componentId) {
            throw new AgentToolException({
              code: 'PATCH_INVALID',
              message: 'removeComponent requires componentId',
              traceId,
            });
          }
          break;
        case 'moveComponent':
          if (!operation.componentId || !operation.newParentId) {
            throw new AgentToolException({
              code: 'PATCH_INVALID',
              message: 'moveComponent requires componentId and newParentId',
              traceId,
            });
          }
          break;
        case 'replacePageLogic':
          this.assertPageLogicValid(operation.logic, traceId);
          break;
      }
    }
  }

  validatePatchAgainstSchema(
    baseSchema: PageSchema,
    patch: readonly EditorPatchOperation[],
    _resultingSchema: PageSchema,
    traceId: string,
  ) {
    this.previewValidatedSchema(baseSchema, patch, traceId);
  }

  previewValidatedSchema(
    baseSchema: PageSchema,
    patch: readonly EditorPatchOperation[],
    traceId: string,
  ): PageSchema {
    let currentSchema = baseSchema;

    for (const operation of patch) {
      switch (operation.op) {
        case 'insertComponent':
          this.assertInsertValid(currentSchema, operation, traceId);
          break;
        case 'updateProps':
          this.assertComponentExists(currentSchema, operation.componentId, traceId);
          break;
        case 'bindEvent':
          this.assertComponentExists(currentSchema, operation.componentId, traceId);
          this.assertActionListValid(operation.actions, traceId);
          break;
        case 'removeComponent':
          this.assertComponentExists(currentSchema, operation.componentId, traceId);
          if (operation.componentId === currentSchema.rootId) {
            throw new AgentToolException({
              code: 'PATCH_INVALID',
              message: 'removeComponent cannot remove the root component',
              traceId,
            });
          }
          break;
        case 'moveComponent':
          this.assertMoveValid(
            currentSchema,
            operation.componentId,
            operation.newParentId,
            traceId,
          );
          break;
        case 'replacePageLogic':
          this.assertPageLogicValid(operation.logic, traceId);
          break;
      }

      currentSchema = this.patchApplyService.applyPatch(currentSchema, [operation]);
    }

    let canonicalSchema: PageSchema;
    try {
      canonicalSchema = requireSupportedPageSchema(currentSchema);
    } catch (error) {
      if (error instanceof SchemaValidationError) {
        throw new AgentToolException({
          code: 'SCHEMA_INVALID',
          message: error.message,
          traceId,
          details: {
            issues: error.issues.map((issue) => ({
              code: issue.code,
              path: [...issue.path],
              message: issue.message,
            })),
          },
        });
      }
      throw new AgentToolException({
        code: 'SCHEMA_INVALID',
        message: error instanceof Error ? error.message : 'Schema is invalid after applying patch',
        traceId,
      });
    }

    this.assertReachable(canonicalSchema, traceId);
    return canonicalSchema;
  }

  private assertInsertValid(
    schema: PageSchema,
    operation: Extract<EditorPatchOperation, { op: 'insertComponent' }>,
    traceId: string,
  ) {
    this.assertComponentExists(schema, operation.parentId, traceId);

    const componentId = (operation.component as { id?: unknown }).id;
    const type = (operation.component as { type?: unknown }).type;

    if (typeof componentId !== 'string' || !componentId.trim()) {
      throw new AgentToolException({
        code: 'PATCH_INVALID',
        message: 'insertComponent component.id is required',
        traceId,
      });
    }

    if (schema.components[componentId]) {
      throw new AgentToolException({
        code: 'PATCH_INVALID',
        message: `Component ${componentId} already exists`,
        traceId,
      });
    }

    if (typeof type !== 'string' || !type.trim()) {
      throw new AgentToolException({
        code: 'PATCH_INVALID',
        message: 'insertComponent component.type is required',
        traceId,
      });
    }

    if (!this.metaRegistry.resolve(type)) {
      throw new AgentToolException({
        code: 'PATCH_INVALID',
        message: `Unsupported component type ${type}`,
        traceId,
      });
    }

    this.assertComponentActionsValid(operation.component, traceId);
  }

  private assertComponentActionsValid(component: Record<string, unknown>, traceId: string): void {
    const events = component.events;
    if (events !== undefined && (!events || typeof events !== 'object' || Array.isArray(events))) {
      throw new AgentToolException({
        code: 'PATCH_INVALID',
        message: 'insertComponent component.events must be an object',
        traceId,
      });
    }
    if (events) {
      for (const actions of Object.values(events as Record<string, unknown>)) {
        this.assertActionListValid(actions, traceId);
      }
    }
    if (component.props && hasCustomScriptInValue(component.props)) {
      throw new AgentToolException({
        code: 'PATCH_POLICY_BLOCKED',
        message: 'customScript is not allowed in schema',
        traceId,
      });
    }
  }

  private assertMoveValid(
    schema: PageSchema,
    componentId: string,
    newParentId: string,
    traceId: string,
  ) {
    this.assertComponentExists(schema, componentId, traceId);
    this.assertComponentExists(schema, newParentId, traceId);

    if (componentId === schema.rootId) {
      throw new AgentToolException({
        code: 'PATCH_INVALID',
        message: 'moveComponent cannot move the root component',
        traceId,
      });
    }

    if (this.isDescendant(schema, newParentId, componentId)) {
      throw new AgentToolException({
        code: 'PATCH_INVALID',
        message: `moveComponent cannot move ${componentId} under its own descendant ${newParentId}`,
        traceId,
      });
    }
  }

  private assertComponentExists(schema: PageSchema, componentId: string, traceId: string) {
    if (!schema.components[componentId]) {
      throw new AgentToolException({
        code: 'NODE_NOT_FOUND',
        message: `Component ${componentId} not found`,
        traceId,
        details: { componentId },
      });
    }
  }

  private assertActionListValid(actions: unknown, traceId: string) {
    const error = getActionValidationError(actions);
    if (!error) return;
    if (error === 'customScript is not allowed in schema') {
      throw new AgentToolException({
        code: 'PATCH_POLICY_BLOCKED',
        message: error,
        traceId,
      });
    }
    throw new AgentToolException({ code: 'PATCH_INVALID', message: error, traceId });
  }

  private assertReachable(schema: PageSchema, traceId: string) {
    const visited = new Set<string>();
    const stack = [schema.rootId];

    while (stack.length > 0) {
      const currentId = stack.pop()!;
      if (visited.has(currentId)) {
        continue;
      }
      visited.add(currentId);
      const component = schema.components[currentId];
      for (const childId of component?.childrenIds ?? []) {
        if (schema.components[childId]) {
          stack.push(childId);
        }
      }
    }

    const orphanIds = Object.keys(schema.components).filter((id) => {
      if (visited.has(id)) {
        return false;
      }

      return !this.isDetachedHiddenDataNode(schema.components[id]);
    });

    if (orphanIds.length > 0) {
      throw new AgentToolException({
        code: 'SCHEMA_INVALID',
        message: 'Schema contains orphaned components after patch application',
        traceId,
        details: { orphanIds },
      });
    }
  }

  private isDetachedHiddenDataNode(
    component: PageSchema['components'][string] | undefined,
  ): boolean {
    if (!component || component.type !== 'Div') {
      return false;
    }

    const props = component.props;
    if (
      !props ||
      props.visible !== false ||
      !Object.prototype.hasOwnProperty.call(props, 'initialValue')
    ) {
      return false;
    }

    return (component.childrenIds?.length ?? 0) === 0;
  }

  private isDescendant(schema: PageSchema, candidateId: string, ancestorId: string): boolean {
    const stack = [...(schema.components[ancestorId]?.childrenIds ?? [])];
    const visited = new Set<string>();
    while (stack.length > 0) {
      const currentId = stack.pop()!;
      if (currentId === candidateId) {
        return true;
      }
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      const component = schema.components[currentId];
      if (component?.childrenIds?.length) {
        stack.push(...component.childrenIds);
      }
    }
    return false;
  }

  private assertPageLogicValid(
    logic: unknown,
    traceId: string,
  ): asserts logic is Record<string, unknown> {
    if (
      !logic ||
      typeof logic !== 'object' ||
      Array.isArray(logic) ||
      !(Object.getPrototypeOf(logic) === null || Object.getPrototypeOf(logic) === Object.prototype)
    ) {
      throw new AgentToolException({
        code: 'PATCH_INVALID',
        message: 'replacePageLogic requires logic object',
        traceId,
      });
    }
  }
}
