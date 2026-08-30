import type { ActionList } from '../actions/action-union';
import type { JsonObject } from './json';

/**
 * 页面组件节点声明
 */
export interface ComponentNode {
  readonly id: string;
  readonly type: string;
  readonly props?: Readonly<JsonObject>;
  readonly childrenIds?: readonly string[];
  readonly events?: Readonly<Record<string, ActionList>>;
}
