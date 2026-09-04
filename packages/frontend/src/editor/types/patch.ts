import type { ComponentNode, PageSchema, ActionList } from '../../types';

export const PATCH_OPERATION_TYPES = [
  'insertComponent',
  'updateProps',
  'bindEvent',
  'removeComponent',
  'moveComponent',
  'replacePageLogic',
] as const;

export type EditorPatchOperationType = (typeof PATCH_OPERATION_TYPES)[number];

export interface EditorPatchInsertComponentOperation {
  op: 'insertComponent';
  parentId: string;
  index?: number;
  component: ComponentNode;
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

export interface EditorPatchReplacePageLogicOperation {
  op: 'replacePageLogic';
  logic: Record<string, unknown>;
}

export type EditorPatchOperation =
  | EditorPatchInsertComponentOperation
  | EditorPatchUpdatePropsOperation
  | EditorPatchBindEventOperation
  | EditorPatchRemoveComponentOperation
  | EditorPatchMoveComponentOperation
  | EditorPatchReplacePageLogicOperation;

export interface PatchPreviewRequest {
  pageId?: string;
  basePageVersion?: number;
  draftSchema?: PageSchema;
  patch: EditorPatchOperation[];
  autoFix?: boolean;
}

export interface PatchPreviewResponse {
  pageId?: string;
  basePageVersion?: number;
  resolvedPageVersion?: number;
  patch: EditorPatchOperation[];
  schema: PageSchema;
  warnings: string[];
  traceId: string;
}
