import type { HttpClientError } from './httpClient';
import { AIServiceError, type AIServiceErrorCode } from '../components/ai-assistant/types/ai-types';

const AI_SERVICE_ERROR_CODES = new Set<AIServiceErrorCode>([
  'API_KEY_MISSING',
  'MODEL_NOT_AVAILABLE',
  'RATE_LIMIT',
  'NETWORK_ERROR',
  'INVALID_RESPONSE',
  'PAGE_NOT_FOUND',
  'PAGE_VERSION_CONFLICT',
  'NODE_NOT_FOUND',
  'NODE_AMBIGUOUS',
  'PATCH_INVALID',
  'SCHEMA_INVALID',
  'AGENT_TIMEOUT',
  'AGENT_POLICY_BLOCKED',
  'PATCH_APPLY_FAILED',
]);

function isKnownAIServiceErrorCode(code: unknown): code is AIServiceErrorCode {
  return typeof code === 'string' && AI_SERVICE_ERROR_CODES.has(code as AIServiceErrorCode);
}

export function toAIServiceError(error: unknown): AIServiceError {
  if (error instanceof AIServiceError) {
    return error;
  }

  const httpError = error as HttpClientError | undefined;
  if (httpError && isKnownAIServiceErrorCode(httpError.code)) {
    return new AIServiceError(httpError.message, httpError.code, {
      status: httpError.status,
      traceId: httpError.traceId,
      ...(httpError.details ? { details: httpError.details } : {}),
    });
  }

  return new AIServiceError(
    error instanceof Error ? error.message : 'Unknown error occurred',
    'NETWORK_ERROR',
    error,
  );
}
