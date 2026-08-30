import type { ActionList } from './dsl';

/**
 * 事件配置类型
 * 直接以 trigger 为 key，actions 为 value
 * 例如：{ onClick: [...], onChange: [...] }
 */
export type EventConfig = Record<string, ActionList>;

// Schema 类型（PageSchema / ComponentNode）自 PR 4 起直接从
// @lowcode-platform/schema-contract 导入，本文件不再提供别名。
