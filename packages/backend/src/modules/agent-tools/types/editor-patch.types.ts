import { EditorActionList } from './editor-action.types';

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
  component: Record<string, unknown>;
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
  actions: EditorActionList;
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
