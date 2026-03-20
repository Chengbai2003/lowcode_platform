import type { A2UIComponent, A2UISchema, ActionList } from '../../types';

export const PATCH_OPERATION_TYPES = [
  'insertComponent',
  'updateProps',
  'bindEvent',
  'removeComponent',
  'moveComponent',
] as const;

export type EditorPatchOperationType = (typeof PATCH_OPERATION_TYPES)[number];

export interface EditorPatchInsertComponentOperation {
  op: 'insertComponent';
  parentId: string;
  index?: number;
  component: A2UIComponent;
}

export interface EditorPatchUpdatePropsOperation {
  op: 'updateProps';
  componentId: string;
  props: Record<string, unknown>;
}

export interface EditorPatchBindEventOperation {
  op: 'bindEvent';
  componentId: string;
  event: string;
  actions: ActionList;
}

export interface EditorPatchRemoveComponentOperation {
  op: 'removeComponent';
  componentId: string;
}

export interface EditorPatchMoveComponentOperation {
  op: 'moveComponent';
  componentId: string;
  newParentId: string;
  newIndex: number;
}

export type EditorPatchOperation =
  | EditorPatchInsertComponentOperation
  | EditorPatchUpdatePropsOperation
  | EditorPatchBindEventOperation
  | EditorPatchRemoveComponentOperation
  | EditorPatchMoveComponentOperation;

export interface PatchPreviewRequest {
  pageId?: string;
  version?: number;
  draftSchema?: A2UISchema;
  patch: EditorPatchOperation[];
  autoFix?: boolean;
}

export interface PatchPreviewResponse {
  pageId?: string;
  baseVersion?: number;
  resolvedVersion?: number;
  patch: EditorPatchOperation[];
  schema: A2UISchema;
  warnings: string[];
  traceId: string;
}
