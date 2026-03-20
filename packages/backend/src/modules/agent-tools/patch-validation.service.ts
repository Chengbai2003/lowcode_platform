import { Injectable } from '@nestjs/common';
import { getCoreActionTypes } from '../ai/prompt-builder';
import { ComponentMetaRegistry } from '../schema-context/component-metadata/component-meta.registry';
import { A2UISchema } from '../schema-context/types/schema.types';
import { assertValidPageSchema } from '../page-schema/schema-validation';
import { AgentToolException } from './agent-tool.exception';
import { PatchApplyService } from './patch-apply.service';
import { EditorAction, EditorActionList } from './types/editor-action.types';
import { EditorPatchOperation } from './types/editor-patch.types';

@Injectable()
export class PatchValidationService {
  private readonly allowedActionTypes = new Set(
    getCoreActionTypes().filter((type) => type !== 'customScript'),
  );

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
      }
    }
  }

  validatePatchAgainstSchema(
    baseSchema: A2UISchema,
    patch: readonly EditorPatchOperation[],
    _resultingSchema: A2UISchema,
    traceId: string,
  ) {
    this.previewValidatedSchema(baseSchema, patch, traceId);
  }

  previewValidatedSchema(
    baseSchema: A2UISchema,
    patch: readonly EditorPatchOperation[],
    traceId: string,
  ): A2UISchema {
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
      }

      currentSchema = this.patchApplyService.applyPatch(currentSchema, [operation]);
    }

    try {
      assertValidPageSchema(currentSchema);
    } catch (error) {
      throw new AgentToolException({
        code: 'SCHEMA_INVALID',
        message: error instanceof Error ? error.message : 'Schema is invalid after applying patch',
        traceId,
      });
    }

    this.assertReachable(currentSchema, traceId);
    return currentSchema;
  }

  private assertInsertValid(
    schema: A2UISchema,
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
  }

  private assertMoveValid(
    schema: A2UISchema,
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

  private assertComponentExists(schema: A2UISchema, componentId: string, traceId: string) {
    if (!schema.components[componentId]) {
      throw new AgentToolException({
        code: 'NODE_NOT_FOUND',
        message: `Component ${componentId} not found`,
        traceId,
        details: { componentId },
      });
    }
  }

  private assertActionListValid(actions: EditorActionList, traceId: string) {
    for (const action of actions) {
      this.assertActionValid(action, traceId);
    }
  }

  private assertActionValid(action: EditorAction, traceId: string) {
    if (!action || typeof action !== 'object' || Array.isArray(action)) {
      throw new AgentToolException({
        code: 'PATCH_INVALID',
        message: 'Each action must be an object',
        traceId,
      });
    }

    if (typeof action.type !== 'string' || !action.type.trim()) {
      throw new AgentToolException({
        code: 'PATCH_INVALID',
        message: 'Action type is required',
        traceId,
      });
    }

    if (action.type === 'customScript') {
      throw new AgentToolException({
        code: 'PATCH_POLICY_BLOCKED',
        message: 'customScript is blocked in bindEvent patches',
        traceId,
      });
    }

    if (!this.allowedActionTypes.has(action.type)) {
      throw new AgentToolException({
        code: 'PATCH_INVALID',
        message: `Unsupported action type ${action.type}`,
        traceId,
      });
    }

    const nestedLists = ['then', 'else', 'actions', 'onSuccess', 'onError', 'onOk', 'onCancel'];
    for (const key of nestedLists) {
      const nested = action[key];
      if (nested === undefined) {
        continue;
      }
      if (!Array.isArray(nested)) {
        throw new AgentToolException({
          code: 'PATCH_INVALID',
          message: `Action field ${key} must be an array`,
          traceId,
        });
      }
      for (const nestedAction of nested) {
        this.assertActionValid(nestedAction as EditorAction, traceId);
      }
    }
  }

  private assertReachable(schema: A2UISchema, traceId: string) {
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

    const orphanIds = Object.keys(schema.components).filter((id) => !visited.has(id));
    if (orphanIds.length > 0) {
      throw new AgentToolException({
        code: 'SCHEMA_INVALID',
        message: 'Schema contains orphaned components after patch application',
        traceId,
        details: { orphanIds },
      });
    }
  }

  private isDescendant(schema: A2UISchema, candidateId: string, ancestorId: string): boolean {
    const stack = [...(schema.components[ancestorId]?.childrenIds ?? [])];
    while (stack.length > 0) {
      const currentId = stack.pop()!;
      if (currentId === candidateId) {
        return true;
      }
      const component = schema.components[currentId];
      if (component?.childrenIds?.length) {
        stack.push(...component.childrenIds);
      }
    }
    return false;
  }
}
