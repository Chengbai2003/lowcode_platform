/**
 * Schema 校验器
 * 校验 A2UI Schema 结构的合法性
 */

import type { A2UISchema } from "../../types";
import type {
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationOptions,
  ValidationErrorType,
} from "./validationTypes";
import {
  ALLOWED_COMPONENT_TYPES,
  ALLOWED_PROPERTIES,
  REQUIRED_PROPERTIES,
  isComponentTypeAllowed,
  isPropertyAllowed,
  containsDangerousPattern,
  DEFAULT_LIMITS,
  normalizeComponentType,
  DANGEROUS_ACTION_TYPES,
} from "../constants/aiSafetyConfig";

/**
 * 默认校验选项
 */
const DEFAULT_OPTIONS: ValidationOptions = {
  strict: false,
  allowUnknownTypes: false,
  maxSchemaSize: DEFAULT_LIMITS.maxSchemaSize,
  maxComponents: DEFAULT_LIMITS.maxComponents,
  maxDepth: DEFAULT_LIMITS.maxDepth,
  allowedComponentTypes: ALLOWED_COMPONENT_TYPES,
  sanitizeDangerousValues: true,
};

/**
 * Schema 校验器类
 */
export class SchemaValidator {
  private options: ValidationOptions;
  private errors: ValidationError[] = [];
  private warnings: ValidationWarning[] = [];
  private fixedSchema: A2UISchema | null = null;
  private fixes: string[] = [];

  constructor(options: Partial<ValidationOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * 校验 Schema
   */
  validate(schema: unknown): ValidationResult {
    this.errors = [];
    this.warnings = [];
    this.fixes = [];

    // 1. 基础类型检查
    if (!this.validateBasicStructure(schema)) {
      return {
        valid: false,
        errors: this.errors,
        warnings: this.warnings,
      };
    }

    const typedSchema = schema as A2UISchema;
    this.fixedSchema = JSON.parse(JSON.stringify(typedSchema));

    // 2. 大小限制检查
    this.validateSizeLimits(typedSchema);

    // 3. 根节点校验
    this.validateRoot(typedSchema);

    // 4. 组件唯一性校验
    this.validateComponentUniqueness(typedSchema);

    // 5. 组件类型校验
    this.validateComponentTypes(typedSchema);

    // 6. 属性校验
    this.validateProperties(typedSchema);

    // 7. 子节点引用校验
    this.validateChildrenReferences(typedSchema);

    // 8. 安全检查
    this.validateSecurity(typedSchema);

    // 9. 嵌套深度检查
    this.validateNestingDepth(typedSchema);

    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      fixed: this.fixes.length > 0,
      fixes: this.fixes,
      sanitizedData: this.fixedSchema,
    };
  }

  /**
   * 校验基础结构
   */
  private validateBasicStructure(schema: unknown): boolean {
    if (!schema || typeof schema !== "object") {
      this.addError("", "Schema 必须是一个对象", "type", schema);
      return false;
    }

    const s = schema as Record<string, unknown>;

    // 检查 components
    if (!s.components || typeof s.components !== "object") {
      this.addError(
        "components",
        "Schema 必须包含 components 对象",
        "required",
      );
      return false;
    }

    // 检查 rootId
    if (!s.rootId || typeof s.rootId !== "string") {
      if (!this.options.strict) {
        // 自动修复：寻找第一个组件作为 rootId
        const keys = Object.keys(s.components as object);
        if (keys.length > 0) {
          (schema as A2UISchema).rootId = keys[0];
          this.addFix("自动设置 rootId 为第一个组件");
        } else {
          this.addError("rootId", "Schema 必须包含有效的 rootId", "required");
          return false;
        }
      } else {
        this.addError("rootId", "Schema 必须包含有效的 rootId", "required");
        return false;
      }
    }

    return true;
  }

  /**
   * 校验大小限制
   */
  private validateSizeLimits(schema: A2UISchema): void {
    // Schema 大小
    const schemaStr = JSON.stringify(schema);
    if (
      schemaStr.length >
      (this.options.maxSchemaSize || DEFAULT_LIMITS.maxSchemaSize)
    ) {
      this.addError(
        "",
        `Schema 大小超过限制 (${schemaStr.length} > ${this.options.maxSchemaSize})`,
        "constraint",
      );
    }

    // 组件数量
    const componentCount = Object.keys(schema.components).length;
    if (
      componentCount >
      (this.options.maxComponents || DEFAULT_LIMITS.maxComponents)
    ) {
      this.addError(
        "components",
        `组件数量超过限制 (${componentCount} > ${this.options.maxComponents})`,
        "constraint",
      );
    }
  }

  /**
   * 校验根节点
   */
  private validateRoot(schema: A2UISchema): void {
    if (!schema.components[schema.rootId]) {
      this.addError(
        "rootId",
        `rootId "${schema.rootId}" 在 components 中不存在`,
        "reference",
        schema.rootId,
      );

      // 尝试自动修复
      if (!this.options.strict) {
        const firstKey = Object.keys(schema.components)[0];
        if (firstKey) {
          this.fixedSchema!.rootId = firstKey;
          this.addFix(`将 rootId 修正为 "${firstKey}"`);
        }
      }
    }
  }

  /**
   * 校验组件 ID 唯一性
   */
  private validateComponentUniqueness(schema: A2UISchema): void {
    const ids = new Set<string>();
    const duplicates: string[] = [];

    for (const [key, component] of Object.entries(schema.components)) {
      if (ids.has(component.id)) {
        duplicates.push(component.id);
        this.addError(
          `components.${key}`,
          `组件 ID "${component.id}" 重复`,
          "constraint",
          component.id,
        );
      }
      ids.add(component.id);

      // 检查 key 和 id 是否一致
      if (component.id !== key) {
        this.addWarning(
          `components.${key}`,
          `组件 key "${key}" 与 id "${component.id}" 不一致`,
          "best_practice",
        );

        // 自动修复
        if (!this.options.strict && this.fixedSchema) {
          this.fixedSchema.components[key].id = key;
          this.addFix(`修正组件 "${key}" 的 id 为 "${key}"`);
        }
      }
    }
  }

  /**
   * 校验组件类型
   */
  private validateComponentTypes(schema: A2UISchema): void {
    const whitelist =
      this.options.allowedComponentTypes || ALLOWED_COMPONENT_TYPES;

    for (const [id, component] of Object.entries(schema.components)) {
      if (!component.type) {
        this.addError(`components.${id}`, "组件缺少 type 属性", "required");
        continue;
      }

      // 检查类型是否在白名单中
      if (!isComponentTypeAllowed(component.type, whitelist)) {
        const normalizedType = normalizeComponentType(component.type);

        if (isComponentTypeAllowed(normalizedType, whitelist)) {
          // 可以自动修正
          if (!this.options.strict && this.fixedSchema) {
            this.fixedSchema.components[id].type = normalizedType;
            this.addFix(
              `组件 "${id}" 类型 "${component.type}" 修正为 "${normalizedType}"`,
            );
          } else {
            this.addWarning(
              `components.${id}`,
              `组件类型 "${component.type}" 不在白名单中，建议使用 "${normalizedType}"`,
              "compatibility",
            );
          }
        } else if (!this.options.allowUnknownTypes) {
          this.addError(
            `components.${id}.type`,
            `组件类型 "${component.type}" 未注册`,
            "unknown",
            component.type,
            `使用已注册的组件类型，如: ${whitelist.slice(0, 5).join(", ")}`,
          );
        }
      }
    }
  }

  /**
   * 校验属性
   */
  private validateProperties(schema: A2UISchema): void {
    for (const [id, component] of Object.entries(schema.components)) {
      const props = component.props || {};
      const componentType = component.type;

      // 检查必填属性
      const requiredProps = REQUIRED_PROPERTIES[componentType] || [];
      for (const requiredKey of requiredProps) {
        if (
          props[requiredKey] === undefined ||
          props[requiredKey] === null ||
          props[requiredKey] === ""
        ) {
          this.addError(
            `components.${id}.props.${requiredKey}`,
            `属性 "${requiredKey}" 是必填的`,
            "required",
          );
        }
      }

      // 检查属性是否在白名单中
      const allowedProps = [
        ...(ALLOWED_PROPERTIES["_common"] || []),
        ...(ALLOWED_PROPERTIES[componentType] || []),
      ];

      for (const propKey of Object.keys(props)) {
        if (allowedProps.length > 0 && !allowedProps.includes(propKey)) {
          this.addWarning(
            `components.${id}.props.${propKey}`,
            `属性 "${propKey}" 不在组件 "${componentType}" 的属性白名单中`,
            "compatibility",
          );
        }

        // 检查属性值长度
        const value = props[propKey];
        if (
          typeof value === "string" &&
          value.length > DEFAULT_LIMITS.maxStringLength
        ) {
          this.addWarning(
            `components.${id}.props.${propKey}`,
            `属性值长度超过限制 (${value.length} > ${DEFAULT_LIMITS.maxStringLength})`,
            "performance",
          );
        }
      }

      // 检查属性数量
      const propCount = Object.keys(props).length;
      if (propCount > DEFAULT_LIMITS.maxPropsPerComponent) {
        this.addWarning(
          `components.${id}.props`,
          `组件属性数量过多 (${propCount} > ${DEFAULT_LIMITS.maxPropsPerComponent})`,
          "performance",
        );
      }
    }
  }

  /**
   * 校验子节点引用
   */
  private validateChildrenReferences(schema: A2UISchema): void {
    const componentIds = new Set(Object.keys(schema.components));
    const referencedIds = new Set<string>();
    const parentMap = new Map<string, string>();

    for (const [id, component] of Object.entries(schema.components)) {
      const childrenIds = component.childrenIds || [];

      for (const childId of childrenIds) {
        // 检查引用是否存在
        if (!componentIds.has(childId)) {
          this.addError(
            `components.${id}.childrenIds`,
            `子节点 "${childId}" 不存在于 components 中`,
            "reference",
            childId,
          );

          // 自动修复：移除无效引用
          if (!this.options.strict && this.fixedSchema) {
            this.fixedSchema.components[id].childrenIds = childrenIds.filter(
              (cid) => cid !== childId,
            );
            this.addFix(`移除组件 "${id}" 的无效子节点引用 "${childId}"`);
          }
        } else {
          // 检查是否有循环引用或多个父节点
          if (referencedIds.has(childId)) {
            const existingParent = parentMap.get(childId);
            this.addWarning(
              `components.${id}.childrenIds`,
              `子节点 "${childId}" 被多个父节点引用 (已有父节点: "${existingParent}")`,
              "best_practice",
            );
          }
          referencedIds.add(childId);
          parentMap.set(childId, id);
        }
      }
    }

    // 检查孤立节点（未被引用的节点，除了 root）
    for (const id of componentIds) {
      if (id !== schema.rootId && !referencedIds.has(id)) {
        this.addWarning(
          `components.${id}`,
          "组件未被任何其他组件引用（孤立节点）",
          "best_practice",
        );
      }
    }
  }

  /**
   * 安全检查
   */
  private validateSecurity(schema: A2UISchema): void {
    for (const [id, component] of Object.entries(schema.components)) {
      const props = component.props || {};

      for (const [propKey, propValue] of Object.entries(props)) {
        // 检查危险属性名
        if (!isPropertyAllowed(component.type, propKey)) {
          this.addWarning(
            `components.${id}.props.${propKey}`,
            `属性 "${propKey}" 不在允许列表中`,
            "compatibility",
          );
        }

        // 检查危险值
        if (this.options.sanitizeDangerousValues) {
          const { dangerous, pattern } = containsDangerousPattern(propValue);
          if (dangerous) {
            this.addError(
              `components.${id}.props.${propKey}`,
              `属性值包含潜在危险的模式: ${pattern}`,
              "security",
              propValue,
              "移除或替换该属性值",
            );

            // 清理危险值
            if (this.fixedSchema) {
              delete this.fixedSchema.components[id].props![propKey];
              this.addFix(`移除组件 "${id}" 的危险属性 "${propKey}"`);
            }
          }
        }
      }

      // 检查事件处理器
      const events = component.events || {};
      for (const [eventName, actions] of Object.entries(events)) {
        if (Array.isArray(actions)) {
          for (const action of actions) {
            this.validateEventAction(id, eventName, action);
          }
        }
      }
    }
  }

  /**
   * 校验事件动作
   */
  private validateEventAction(
    componentId: string,
    eventName: string,
    action: unknown,
  ): void {
    if (!action || typeof action !== "object") return;

    const typedAction = action as Record<string, unknown>;

    // 检查动作类型
    if (!typedAction.type) {
      this.addError(
        `components.${componentId}.events.${eventName}`,
        "事件动作缺少 type 属性",
        "required",
      );
    }

    // 检查危险的动作类型（使用配置常量）
    if (
      typedAction.type &&
      DANGEROUS_ACTION_TYPES.includes(String(typedAction.type))
    ) {
      this.addError(
        `components.${componentId}.events.${eventName}`,
        `事件动作类型 "${typedAction.type}" 不被允许`,
        "security",
        typedAction.type,
        "使用安全的动作类型，如 navigate, setState, api 等",
      );
    }
  }

  /**
   * 校验嵌套深度
   */
  private validateNestingDepth(schema: A2UISchema): void {
    const maxDepth = this.options.maxDepth || DEFAULT_LIMITS.maxDepth;
    const visited = new Set<string>();

    const getDepth = (componentId: string, depth: number): number => {
      if (visited.has(componentId)) {
        // 检测到循环引用
        this.addError(
          `components.${componentId}`,
          "检测到循环引用",
          "constraint",
        );
        return depth;
      }
      visited.add(componentId);

      const component = schema.components[componentId];
      if (!component) return depth;

      const childrenIds = component.childrenIds || [];
      if (childrenIds.length === 0) return depth;

      const childDepths = childrenIds.map((childId) =>
        getDepth(childId, depth + 1),
      );
      return Math.max(...childDepths);
    };

    const depth = getDepth(schema.rootId, 1);

    if (depth > maxDepth) {
      this.addWarning(
        "",
        `Schema 嵌套深度超过建议值 (${depth} > ${maxDepth})`,
        "performance",
      );
    }
  }

  /**
   * 添加错误
   */
  private addError(
    path: string,
    message: string,
    type: ValidationErrorType,
    value?: unknown,
    suggestion?: string,
  ): void {
    this.errors.push({ path, message, type, value, suggestion });
  }

  /**
   * 添加警告
   */
  private addWarning(
    path: string,
    message: string,
    type: ValidationWarning["type"],
    value?: unknown,
  ): void {
    this.warnings.push({ path, message, type, value });
  }

  /**
   * 添加修复记录
   */
  private addFix(description: string): void {
    this.fixes.push(description);
  }
}

/**
 * 快捷校验函数
 */
export function validateSchema(
  schema: unknown,
  options?: Partial<ValidationOptions>,
): ValidationResult {
  const validator = new SchemaValidator(options);
  return validator.validate(schema);
}

/**
 * 快捷校验函数（仅返回是否有效）
 */
export function isValidSchema(
  schema: unknown,
  options?: Partial<ValidationOptions>,
): boolean {
  const result = validateSchema(schema, options);
  return result.valid;
}

/**
 * 校验并自动修复 Schema
 */
export function validateAndFixSchema(
  schema: unknown,
  options?: Partial<ValidationOptions>,
): { schema: A2UISchema | null; result: ValidationResult } {
  const validator = new SchemaValidator({ ...options, strict: false });
  const result = validator.validate(schema);

  return {
    schema: result.sanitizedData as A2UISchema | null,
    result,
  };
}
