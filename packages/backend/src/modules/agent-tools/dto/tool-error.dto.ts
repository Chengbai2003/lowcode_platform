export const TOOL_ERROR_CODES = [
  'PAGE_NOT_FOUND',
  'PAGE_VERSION_CONFLICT',
  'NODE_NOT_FOUND',
  'NODE_AMBIGUOUS',
  'PATCH_INVALID',
  'PATCH_POLICY_BLOCKED',
  'SCHEMA_INVALID',
  'AGENT_TIMEOUT',
  'AGENT_POLICY_BLOCKED',
] as const;

export type ToolErrorCode = (typeof TOOL_ERROR_CODES)[number];

export interface ToolErrorDto {
  code: ToolErrorCode;
  message: string;
  details?: Record<string, unknown>;
  traceId: string;
}
