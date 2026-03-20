export const TOOL_ERROR_CODES = [
  'PAGE_NOT_FOUND',
  'PAGE_VERSION_CONFLICT',
  'NODE_NOT_FOUND',
  'PATCH_INVALID',
  'PATCH_POLICY_BLOCKED',
  'SCHEMA_INVALID',
] as const;

export type ToolErrorCode = (typeof TOOL_ERROR_CODES)[number];

export interface ToolErrorDto {
  code: ToolErrorCode;
  message: string;
  details?: Record<string, unknown>;
  traceId: string;
}
