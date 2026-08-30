/**
 * 支持的 DSL 格式版本
 * M0 开发期固定为 0，M1b 完成后冻结首个正式版本 1
 */
export const SUPPORTED_SCHEMA_VERSIONS = [0] as const;

export type SupportedSchemaVersion = (typeof SUPPORTED_SCHEMA_VERSIONS)[number];

export const CURRENT_DRAFT_SCHEMA_VERSION: SupportedSchemaVersion = 0;

export function isSupportedSchemaVersion(version: unknown): version is SupportedSchemaVersion {
  return (
    typeof version === 'number' &&
    (SUPPORTED_SCHEMA_VERSIONS as readonly number[]).includes(version)
  );
}
