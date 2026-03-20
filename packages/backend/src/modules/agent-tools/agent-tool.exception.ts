import { HttpException, HttpStatus } from '@nestjs/common';
import { ToolErrorCode } from './dto/tool-error.dto';

const STATUS_BY_TOOL_ERROR_CODE: Record<ToolErrorCode, HttpStatus> = {
  PAGE_NOT_FOUND: HttpStatus.NOT_FOUND,
  PAGE_VERSION_CONFLICT: HttpStatus.CONFLICT,
  NODE_NOT_FOUND: HttpStatus.NOT_FOUND,
  PATCH_INVALID: HttpStatus.BAD_REQUEST,
  PATCH_POLICY_BLOCKED: HttpStatus.UNPROCESSABLE_ENTITY,
  SCHEMA_INVALID: HttpStatus.BAD_REQUEST,
};

export class AgentToolException extends HttpException {
  constructor(input: {
    code: ToolErrorCode;
    message: string;
    traceId: string;
    details?: Record<string, unknown>;
  }) {
    super(
      {
        code: input.code,
        message: input.message,
        traceId: input.traceId,
        details: input.details,
      },
      STATUS_BY_TOOL_ERROR_CODE[input.code],
    );
  }
}
