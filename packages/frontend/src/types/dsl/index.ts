/**
 * M0-4 Scope A：渲染器运行态执行类型已迁至 @lowcode-platform/renderer（子路径 /dsl）。
 * 此处保留 type-only re-export 以维持前端 types barrel 的既有消费面；
 * 新代码请直接从 renderer 包导入。
 */
export type * from '@lowcode-platform/renderer/dsl';
