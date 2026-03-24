import { A2UISchema } from '../../schema-context/types/schema.types';
import { EditorPatchOperation } from '../types/editor-patch.types';

export interface PatchPreviewResponseDto {
  pageId?: string;
  baseVersion?: number;
  resolvedVersion?: number;
  patch: EditorPatchOperation[];
  schema: A2UISchema;
  warnings: string[];
  traceId: string;
}
