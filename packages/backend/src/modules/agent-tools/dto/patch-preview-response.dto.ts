import { PageSchema, ComponentNode } from '@lowcode-platform/schema-contract';
import { EditorPatchOperation } from '../types/editor-patch.types';

export interface PatchPreviewResponseDto {
  pageId?: string;
  basePageVersion?: number;
  resolvedPageVersion?: number;
  patch: EditorPatchOperation[];
  schema: PageSchema;
  warnings: string[];
  traceId: string;
}
