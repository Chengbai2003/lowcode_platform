/**
 * M0-4 Scope A：渲染器边界校验逻辑已迁至 @lowcode-platform/renderer。
 * 保留 re-export 以维持编辑器既有消费面；新代码请直接从 renderer 包导入。
 */
export {
  validateA2UISchema,
  safeValidateA2UISchema,
  validateA2UISchemaWithWhitelist,
  validateAndAutoFixA2UISchema,
} from '@lowcode-platform/renderer';
export type {
  SharedSchemaError,
  SharedSchemaSuccess,
  SharedSchemaFailure,
  SharedSchemaIssue,
} from '@lowcode-platform/renderer';
