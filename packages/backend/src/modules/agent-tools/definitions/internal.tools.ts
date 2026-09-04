import { PatchAutoFixService } from '../patch-auto-fix.service';
import { PatchValidationService } from '../patch-validation.service';
import { ToolDefinition } from '../types/tool.types';
import { asPatchArray, createObjectSchema } from '../tool-input.coerce';

export interface InternalToolsDeps {
  patchAutoFixService: PatchAutoFixService;
  patchValidationService: PatchValidationService;
}

export function createInternalDefinitions(deps: InternalToolsDeps): ToolDefinition[] {
  const { patchAutoFixService, patchValidationService } = deps;
  return [
    {
      name: 'validate_patch',
      description: '校验 patch 在当前 working schema 上是否有效。',
      inputSchema: createObjectSchema(
        '校验 patch。',
        { patch: { type: 'array', items: { type: 'object' } } },
        ['patch'],
      ),
      visibility: 'internal',
      execute: async (input, context) => {
        const patch = asPatchArray(input.patch);
        patchValidationService.validatePatchShape(patch, context.traceId);
        patchValidationService.previewValidatedSchema(
          context.workingSchema,
          patch,
          context.traceId,
        );
        return { data: { valid: true } };
      },
    },
    {
      name: 'auto_fix_patch',
      description: '对 patch 做保守 auto-fix。',
      inputSchema: createObjectSchema(
        '自动修复 patch。',
        { patch: { type: 'array', items: { type: 'object' } } },
        ['patch'],
      ),
      visibility: 'internal',
      execute: async (input, context) => {
        const patch = asPatchArray(input.patch);
        const result = patchAutoFixService.autoFix(patch, context.workingSchema);
        return {
          data: { patch: result.patch, repairCount: result.repairCount },
          warnings: result.warnings,
        };
      },
    },
    {
      name: 'preview_patch',
      description: '在内存中预览 patch 应用结果。',
      inputSchema: createObjectSchema(
        '预览 patch。',
        { patch: { type: 'array', items: { type: 'object' } } },
        ['patch'],
      ),
      visibility: 'internal',
      execute: async (input, context) => {
        const patch = asPatchArray(input.patch);
        patchValidationService.validatePatchShape(patch, context.traceId);
        const nextSchema = patchValidationService.previewValidatedSchema(
          context.workingSchema,
          patch,
          context.traceId,
        );
        const normalizedPatch = patch.map((operation) => {
          if (operation.op === 'replacePageLogic') {
            return {
              ...operation,
              logic: (nextSchema.logic ?? {}) as Record<string, unknown>,
            };
          }
          return operation;
        });
        return { data: { patch: normalizedPatch }, updatedWorkingSchema: nextSchema };
      },
    },
  ];
}
