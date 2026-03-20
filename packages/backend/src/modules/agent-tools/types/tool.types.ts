import { BackendComponentMeta } from '../../schema-context/component-metadata/component-meta.types';
import { FocusContextResult } from '../../schema-context/types/focus-context.types';
import { A2UISchema } from '../../schema-context/types/schema.types';
import { EditorPatchOperation } from './editor-patch.types';

export interface ToolExecutionContext {
  pageId?: string;
  version?: number;
  resolvedVersion?: number;
  draftSchema?: A2UISchema;
  workingSchema: A2UISchema;
  accumulatedPatch: EditorPatchOperation[];
  warnings: string[];
  traceId: string;
}

export interface ToolExecutionResult {
  data?: unknown;
  patchDelta?: EditorPatchOperation[];
  updatedWorkingSchema?: A2UISchema;
  warnings?: string[];
}

export interface ComponentMetaResult {
  component?: BackendComponentMeta;
  components?: BackendComponentMeta[];
}

export type ToolDataResult =
  | A2UISchema
  | FocusContextResult
  | ComponentMetaResult
  | { valid: true }
  | {
      patch: EditorPatchOperation[];
    };

export interface ToolDefinition {
  name: string;
  execute: (
    input: Record<string, unknown>,
    context: ToolExecutionContext,
  ) => Promise<ToolExecutionResult> | ToolExecutionResult;
}
