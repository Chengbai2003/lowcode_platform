import type { A2UISchema } from '../../types';
import type { Command, CommandOptions } from '../store/history';
import type { EditorPatchOperation } from '../types/patch';
import { applyPatchToSchema } from '../services/patchAdapter';

// ============================================
// Schema 变更命令
// ============================================

/**
 * Schema 变更回调类型
 */
export type SchemaChangeCallback = (schema: A2UISchema) => void;

/**
 * UpdateSchemaCommand - Schema 更新命令
 * 支持完整的 Schema 替换操作
 */
export class UpdateSchemaCommand implements Command {
  readonly id: string;
  readonly timestamp: number;
  readonly description: string;

  private oldSchema: A2UISchema;
  private newSchema: A2UISchema;
  private onChange: SchemaChangeCallback;
  private applyOnExecute: boolean;

  constructor(
    oldSchema: A2UISchema,
    newSchema: A2UISchema,
    onChange: SchemaChangeCallback,
    options: CommandOptions & { timestamp: number; id: string; applyOnExecute?: boolean },
  ) {
    this.oldSchema = oldSchema;
    this.newSchema = newSchema;
    this.onChange = onChange;
    this.description = options.description;
    this.timestamp = options.timestamp;
    this.id = options.id;
    this.applyOnExecute = options.applyOnExecute ?? true;
  }

  execute(): void {
    // 历史合并场景下，schema 可能已提前应用，此时 execute 仅负责入栈。
    if (this.applyOnExecute) {
      this.onChange(this.newSchema);
    }
  }

  undo(): void {
    // 撤销时恢复旧 schema
    this.onChange(this.oldSchema);
  }

  redo(): void {
    // 重做时再次应用新 schema
    this.onChange(this.newSchema);
  }

  getOldSchema(): A2UISchema {
    return this.oldSchema;
  }

  getNewSchema(): A2UISchema {
    return this.newSchema;
  }
}

/**
 * 创建 UpdateSchemaCommand 的工厂函数
 */
export function createUpdateSchemaCommand(
  oldSchema: A2UISchema,
  newSchema: A2UISchema,
  onChange: SchemaChangeCallback,
  description: string = '更新 Schema',
  config: { applyOnExecute?: boolean } = {},
): UpdateSchemaCommand {
  const id = `schema_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  return new UpdateSchemaCommand(oldSchema, newSchema, onChange, {
    description,
    id,
    applyOnExecute: config.applyOnExecute,
    timestamp: Date.now(),
  });
}

export function createPatchCommand(
  oldSchema: A2UISchema,
  patch: readonly EditorPatchOperation[],
  onChange: SchemaChangeCallback,
  description: string = '应用 Patch',
): UpdateSchemaCommand {
  const nextSchema = applyPatchToSchema(oldSchema, patch);
  return createUpdateSchemaCommand(oldSchema, nextSchema, onChange, description);
}

// ============================================
// 组件操作命令
// ============================================

/**
 * ComponentOperation - 组件操作类型
 */
export type ComponentOperation =
  | {
      type: 'add';
      component: A2UISchema['components'][string];
      parentId: string;
    }
  | {
      type: 'delete';
      componentId: string;
      component: A2UISchema['components'][string];
      parentId: string;
      index: number;
    }
  | {
      type: 'move';
      componentId: string;
      oldParentId: string;
      newParentId: string;
      oldIndex: number;
      newIndex: number;
    }
  | {
      type: 'update';
      componentId: string;
      oldProps: Record<string, unknown>;
      newProps: Record<string, unknown>;
    };

/**
 * ComponentCommand - 组件操作命令
 * 支持增删改移动组件
 */
export class ComponentCommand implements Command {
  readonly id: string;
  readonly timestamp: number;
  readonly description: string;

  private operation: ComponentOperation;
  private getSchema: () => A2UISchema;
  private setSchema: SchemaChangeCallback;

  constructor(
    operation: ComponentOperation,
    getSchema: () => A2UISchema,
    setSchema: SchemaChangeCallback,
    options: CommandOptions & { timestamp: number; id: string },
  ) {
    this.operation = operation;
    this.getSchema = getSchema;
    this.setSchema = setSchema;
    this.description = options.description;
    this.timestamp = options.timestamp;
    this.id = options.id;
  }

  execute(): void {
    const schema = this.getSchema();
    const newSchema = this.applyOperation(schema);
    this.setSchema(newSchema);
  }

  undo(): void {
    const schema = this.getSchema();
    const newSchema = this.reverseOperation(schema);
    this.setSchema(newSchema);
  }

  redo(): void {
    this.execute();
  }

  private applyOperation(schema: A2UISchema): A2UISchema {
    const components = { ...schema.components };

    switch (this.operation.type) {
      case 'add': {
        const { component, parentId } = this.operation;
        components[component.id] = component;
        if (parentId && components[parentId]) {
          components[parentId] = {
            ...components[parentId],
            childrenIds: [...(components[parentId].childrenIds || []), component.id],
          };
        }
        break;
      }
      case 'delete': {
        const { componentId, parentId } = this.operation;
        delete components[componentId];
        if (parentId && components[parentId]) {
          components[parentId] = {
            ...components[parentId],
            childrenIds: (components[parentId].childrenIds || []).filter(
              (id) => id !== componentId,
            ),
          };
        }
        break;
      }
      case 'move': {
        const { componentId, oldParentId, newParentId, newIndex } = this.operation;
        if (components[oldParentId]) {
          components[oldParentId] = {
            ...components[oldParentId],
            childrenIds: (components[oldParentId].childrenIds || []).filter(
              (id) => id !== componentId,
            ),
          };
        }
        if (components[newParentId]) {
          const childrenIds = [...(components[newParentId].childrenIds || [])];
          childrenIds.splice(newIndex, 0, componentId);
          components[newParentId] = {
            ...components[newParentId],
            childrenIds,
          };
        }
        break;
      }
      case 'update': {
        const { componentId, newProps } = this.operation;
        if (components[componentId]) {
          components[componentId] = {
            ...components[componentId],
            props: { ...components[componentId].props, ...newProps },
          };
        }
        break;
      }
    }

    return { ...schema, components };
  }

  private reverseOperation(schema: A2UISchema): A2UISchema {
    const components = { ...schema.components };

    switch (this.operation.type) {
      case 'add': {
        const { component, parentId } = this.operation;
        delete components[component.id];
        if (parentId && components[parentId]) {
          components[parentId] = {
            ...components[parentId],
            childrenIds: (components[parentId].childrenIds || []).filter(
              (id) => id !== component.id,
            ),
          };
        }
        break;
      }
      case 'delete': {
        const { component, parentId, index } = this.operation;
        components[component.id] = component;
        if (parentId && components[parentId]) {
          const childrenIds = [...(components[parentId].childrenIds || [])];
          childrenIds.splice(index, 0, component.id);
          components[parentId] = {
            ...components[parentId],
            childrenIds,
          };
        }
        break;
      }
      case 'move': {
        const { componentId, oldParentId, newParentId, oldIndex } = this.operation;
        if (components[newParentId]) {
          components[newParentId] = {
            ...components[newParentId],
            childrenIds: (components[newParentId].childrenIds || []).filter(
              (id) => id !== componentId,
            ),
          };
        }
        if (components[oldParentId]) {
          const childrenIds = [...(components[oldParentId].childrenIds || [])];
          childrenIds.splice(oldIndex, 0, componentId);
          components[oldParentId] = {
            ...components[oldParentId],
            childrenIds,
          };
        }
        break;
      }
      case 'update': {
        const { componentId, oldProps } = this.operation;
        if (components[componentId]) {
          const currentProps = { ...components[componentId].props };
          // 移除新添加的属性，恢复旧属性
          const propsKeys = Object.keys(components[componentId].props || {});
          for (const key of propsKeys) {
            if (!(key in oldProps)) {
              delete currentProps[key];
            }
          }
          components[componentId] = {
            ...components[componentId],
            props: { ...currentProps, ...oldProps },
          };
        }
        break;
      }
    }

    return { ...schema, components };
  }
}

/**
 * 创建添加组件命令
 */
export function createAddComponentCommand(
  component: A2UISchema['components'][string],
  parentId: string,
  getSchema: () => A2UISchema,
  setSchema: SchemaChangeCallback,
  description?: string,
): ComponentCommand {
  return new ComponentCommand({ type: 'add', component, parentId }, getSchema, setSchema, {
    description: description || `添加组件 ${component.type}`,
    id: `add_${component.id}_${Date.now()}`,
    timestamp: Date.now(),
  });
}

/**
 * 创建删除组件命令
 */
export function createDeleteComponentCommand(
  componentId: string,
  component: A2UISchema['components'][string],
  parentId: string,
  index: number,
  getSchema: () => A2UISchema,
  setSchema: SchemaChangeCallback,
  description?: string,
): ComponentCommand {
  return new ComponentCommand(
    { type: 'delete', componentId, component, parentId, index },
    getSchema,
    setSchema,
    {
      description: description || `删除组件 ${component.type}`,
      id: `delete_${componentId}_${Date.now()}`,
      timestamp: Date.now(),
    },
  );
}

/**
 * 创建移动组件命令
 */
export function createMoveComponentCommand(
  componentId: string,
  oldParentId: string,
  newParentId: string,
  oldIndex: number,
  newIndex: number,
  getSchema: () => A2UISchema,
  setSchema: SchemaChangeCallback,
  description?: string,
): ComponentCommand {
  return new ComponentCommand(
    { type: 'move', componentId, oldParentId, newParentId, oldIndex, newIndex },
    getSchema,
    setSchema,
    {
      description: description || `移动组件`,
      id: `move_${componentId}_${Date.now()}`,
      timestamp: Date.now(),
    },
  );
}

/**
 * 创建更新组件属性命令
 */
export function createUpdatePropsCommand(
  componentId: string,
  oldProps: Record<string, unknown>,
  newProps: Record<string, unknown>,
  getSchema: () => A2UISchema,
  setSchema: SchemaChangeCallback,
  description?: string,
): ComponentCommand {
  return new ComponentCommand(
    { type: 'update', componentId, oldProps, newProps },
    getSchema,
    setSchema,
    {
      description: description || `更新属性`,
      id: `update_${componentId}_${Date.now()}`,
      timestamp: Date.now(),
    },
  );
}

// ============================================
// 批量操作命令（Macro Command）
// ============================================

/**
 * MacroCommand - 宏命令，用于批量操作
 * 将多个命令组合成一个原子操作
 */
export class MacroCommand implements Command {
  readonly id: string;
  readonly timestamp: number;
  readonly description: string;
  private commands: Command[];

  constructor(commands: Command[], options: CommandOptions & { timestamp: number; id: string }) {
    this.commands = commands;
    this.description = options.description;
    this.timestamp = options.timestamp;
    this.id = options.id;
  }

  execute(): void {
    this.commands.forEach((cmd) => cmd.execute());
  }

  undo(): void {
    // 撤销时需要逆序执行
    [...this.commands].reverse().forEach((cmd) => cmd.undo());
  }

  redo(): void {
    this.commands.forEach((cmd) => cmd.redo());
  }
}

/**
 * 创建宏命令
 */
export function createMacroCommand(
  commands: Command[],
  description: string = '批量操作',
): MacroCommand {
  return new MacroCommand(commands, {
    description,
    id: `macro_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    timestamp: Date.now(),
  });
}
