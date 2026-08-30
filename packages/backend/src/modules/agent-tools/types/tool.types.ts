import { BackendComponentMeta } from '../../schema-context/component-metadata/component-meta.types';
import { FocusContextResult } from '../../schema-context/types/focus-context.types';
import { PageSchema, ComponentNode } from '@lowcode-platform/schema-contract';
import { EditorPatchOperation } from './editor-patch.types';

export type ToolVisibility = 'agent' | 'internal';

export interface ToolInputSchema {
  type: 'object';
  description?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ToolExecutionContext {
  pageId?: string;
  /** 上下文解析基准：页面内容修订版本 */
  basePageVersion?: number;
  resolvedPageVersion?: number;
  draftSchema?: PageSchema;
  workingSchema: PageSchema;
  accumulatedPatch: EditorPatchOperation[];
  warnings: string[];
  traceId: string;
}

export interface ToolExecutionResult {
  data?: unknown;
  patchDelta?: EditorPatchOperation[];
  updatedWorkingSchema?: PageSchema;
  warnings?: string[];
}

export interface ComponentMetaResult {
  component?: BackendComponentMeta;
  components?: BackendComponentMeta[];
}

export type ToolDataResult =
  | PageSchema
  | FocusContextResult
  | ComponentMetaResult
  | { valid: true }
  | {
      patch: EditorPatchOperation[];
    };

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  visibility: ToolVisibility;
  execute: (
    input: Record<string, unknown>,
    context: ToolExecutionContext,
  ) => Promise<ToolExecutionResult> | ToolExecutionResult;
}
