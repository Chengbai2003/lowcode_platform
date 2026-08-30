/**
 * A2UISchema / A2UIComponent 暂时 re-export Contract 单一真相源（PR 4 移除别名，直接导入）。
 *
 * 语义变更（Issue #16 / M0-1）：
 * - Schema 不再包含页面修订版本字段（version 已移除）；
 * - schemaVersion 只描述 DSL 格式（M0 固定为 0），必填。
 */
export type {
  PageSchema as A2UISchema,
  ComponentNode as A2UIComponent,
} from '@lowcode-platform/schema-contract';

import type { ActionList } from './dsl';

/**
 * 事件配置类型
 * 直接以 trigger 为 key，actions 为 value
 * 例如：{ onClick: [...], onChange: [...] }
 */
export type EventConfig = Record<string, ActionList>;
