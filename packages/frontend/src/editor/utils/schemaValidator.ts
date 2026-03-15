/**
 * Schema 校验器
 * 校验 A2UI Schema 结构的合法性
 */

import type { A2UISchema } from '../../types';
import {
  validateA2UISchemaWithWhitelist,
  validateAndAutoFixA2UISchema,
} from '../../schema/schemaValidation';
import type {
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationOptions,
  ValidationErrorType,
} from './validationTypes';
import {
  ALLOWED_COMPONENT_TYPES,
  ALLOWED_PROPERTIES,
  REQUIRED_PROPERTIES,
  isPropertyAllowed,
  containsDangerousPattern,
  DEFAULT_LIMITS,
  DANGEROUS_ACTION_TYPES,
} from '../constants/aiSafetyConfig';

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
const COMPONENT_ID_REGEX = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
const RESERVED_COMPONENT_IDS = new Set([
  'data',
  'formData',
  'state',
  'route',
  'user',
  'ui',
  'api',
  'utils',
  'navigate',
  'back',
  'event',
  'dispatch',
  'getState',
  'components',
  'true',
  'false',
  'null',
  'undefined',
  'if',
  'else',
  'for',
  'while',
  'return',
  'switch',
  'case',
  'default',
  'typeof',
  'new',
  'this',
  'class',
  'extends',
  'let',
  'const',
  'var',
  'function',
  'import',
  'export',
  'void',
  'delete',
  'in',
  'instanceof',
  '__proto__',
  'constructor',
  'prototype',
  'Math',
  'JSON',
  'Date',
  'String',
  'Number',
  'Boolean',
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
]);

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

    const whitelist = this.options.allowUnknownTypes
      ? []
      : (this.options.allowedComponentTypes ?? ALLOWED_COMPONENT_TYPES);
    const coreResult = this.options.strict
      ? validateA2UISchemaWithWhitelist(schema, whitelist)
      : validateAndAutoFixA2UISchema(schema, whitelist);

    if (!coreResult.success) {
      this.consumeCoreValidationError(coreResult.error);
      return {
        valid: false,
        errors: this.errors,
        warnings: this.warnings,
      };
    }

    const typedSchema = coreResult.data as A2UISchema;
    this.fixedSchema = JSON.parse(JSON.stringify(typedSchema));
    const coreFixes = (coreResult as { fixes?: string[] }).fixes;
    if (Array.isArray(coreFixes) && coreFixes.length > 0) {
      this.fixes.push(...coreFixes);
    }

    // 1. 大小限制检查
    this.validateSizeLimits(typedSchema);

    // 2. 组件唯一性校验
    this.validateComponentUniqueness(typedSchema);

    // 3. 属性校验
    this.validateProperties(typedSchema);

    // 4. 安全检查
    this.validateSecurity(typedSchema);

    // 5. 嵌套深度检查
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

  private consumeCoreValidationError(error: {
    issues?: Array<{ path?: Array<string | number>; message: string }>;
  }): void {
    const issues = error.issues ?? [];

    if (issues.length === 0) {
      this.addError('', 'Schema 校验失败', 'format');
      return;
    }

    for (const issue of issues) {
      const path = Array.isArray(issue.path) ? issue.path.join('.') : '';
      this.addError(path, issue.message, 'format');
    }
  }

  /**
   * 校验大小限制
   */
  private validateSizeLimits(schema: A2UISchema): void {
    // Schema 大小
    const schemaStr = JSON.stringify(schema);
    if (schemaStr.length > (this.options.maxSchemaSize || DEFAULT_LIMITS.maxSchemaSize)) {
      this.addError(
        '',
        `Schema 大小超过限制 (${schemaStr.length} > ${this.options.maxSchemaSize})`,
        'constraint',
      );
    }

    // 组件数量
    const componentCount = Object.keys(schema.components).length;
    if (componentCount > (this.options.maxComponents || DEFAULT_LIMITS.maxComponents)) {
      this.addError(
        'components',
        `组件数量超过限制 (${componentCount} > ${this.options.maxComponents})`,
        'constraint',
      );
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
          'constraint',
          component.id,
        );
      }
      ids.add(component.id);

      if (!COMPONENT_ID_REGEX.test(component.id)) {
        this.addWarning(
          `components.${key}.id`,
          `组件 ID "${component.id}" 不符合 JS 标识符规则，无法作为表达式顶层变量使用`,
          'best_practice',
          component.id,
        );
      } else if (RESERVED_COMPONENT_IDS.has(component.id)) {
        this.addWarning(
          `components.${key}.id`,
          `组件 ID "${component.id}" 与系统保留字冲突，无法作为表达式顶层变量使用`,
          'best_practice',
          component.id,
        );
      }

      // 检查 key 和 id 是否一致
      if (component.id !== key) {
        this.addWarning(
          `components.${key}`,
          `组件 key "${key}" 与 id "${component.id}" 不一致`,
          'best_practice',
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
          props[requiredKey] === ''
        ) {
          this.addError(
            `components.${id}.props.${requiredKey}`,
            `属性 "${requiredKey}" 是必填的`,
            'required',
          );
        }
      }

      // 检查属性是否在白名单中
      const allowedProps = [
        ...(ALLOWED_PROPERTIES['_common'] || []),
        ...(ALLOWED_PROPERTIES[componentType] || []),
      ];

      for (const propKey of Object.keys(props)) {
        if (allowedProps.length > 0 && !allowedProps.includes(propKey)) {
          this.addWarning(
            `components.${id}.props.${propKey}`,
            `属性 "${propKey}" 不在组件 "${componentType}" 的属性白名单中`,
            'compatibility',
          );
        }

        // 检查属性值长度
        const value = props[propKey];
        if (typeof value === 'string' && value.length > DEFAULT_LIMITS.maxStringLength) {
          this.addWarning(
            `components.${id}.props.${propKey}`,
            `属性值长度超过限制 (${value.length} > ${DEFAULT_LIMITS.maxStringLength})`,
            'performance',
          );
        }
      }

      // 检查属性数量
      const propCount = Object.keys(props).length;
      if (propCount > DEFAULT_LIMITS.maxPropsPerComponent) {
        this.addWarning(
          `components.${id}.props`,
          `组件属性数量过多 (${propCount} > ${DEFAULT_LIMITS.maxPropsPerComponent})`,
          'performance',
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
            'compatibility',
          );
        }

        // 检查危险值
        if (this.options.sanitizeDangerousValues) {
          const { dangerous, pattern } = containsDangerousPattern(propValue);
          if (dangerous) {
            this.addError(
              `components.${id}.props.${propKey}`,
              `属性值包含潜在危险的模式: ${pattern}`,
              'security',
              propValue,
              '移除或替换该属性值',
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
  private validateEventAction(componentId: string, eventName: string, action: unknown): void {
    if (!action || typeof action !== 'object') return;

    const typedAction = action as Record<string, unknown>;

    // 检查动作类型
    if (!typedAction.type) {
      this.addError(
        `components.${componentId}.events.${eventName}`,
        '事件动作缺少 type 属性',
        'required',
      );
    }

    // 检查危险的动作类型（使用配置常量）
    if (typedAction.type && DANGEROUS_ACTION_TYPES.includes(String(typedAction.type))) {
      this.addError(
        `components.${componentId}.events.${eventName}`,
        `事件动作类型 "${typedAction.type}" 不被允许`,
        'security',
        typedAction.type,
        '使用安全的动作类型，如 navigate, setState, api 等',
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
        this.addError(`components.${componentId}`, '检测到循环引用', 'constraint');
        return depth;
      }
      visited.add(componentId);

      const component = schema.components[componentId];
      if (!component) return depth;

      const childrenIds = component.childrenIds || [];
      if (childrenIds.length === 0) return depth;

      const childDepths = childrenIds.map((childId) => getDepth(childId, depth + 1));
      return Math.max(...childDepths);
    };

    const depth = getDepth(schema.rootId, 1);

    if (depth > maxDepth) {
      this.addWarning('', `Schema 嵌套深度超过建议值 (${depth} > ${maxDepth})`, 'performance');
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
    type: ValidationWarning['type'],
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
export function isValidSchema(schema: unknown, options?: Partial<ValidationOptions>): boolean {
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
