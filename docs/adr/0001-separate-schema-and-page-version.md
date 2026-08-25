# ADR-0001：分离 Schema 协议版本与页面内容版本

> Status: Accepted  
> Date: 2026-08-25

## 背景

当前 `A2UISchema.version` 同时承担 Schema 格式提示和页面快照版本语义，Repository 保存时会把下一页面版本写回 Schema。这会使 DSL 演进、乐观锁、快照恢复和 Compiler 兼容判断相互耦合。

项目尚未正式发布，没有需要长期兼容的生产 Schema，因此可以一次性修正模型，不建设历史版本迁移链。

## 决策

采用两个独立字段：

```ts
interface PageSchema {
  schemaVersion: number;
}

interface PageRecord {
  pageVersion: number;
  schema: PageSchema;
}
```

- `schemaVersion` 只描述 DSL 格式。
- `pageVersion` 只描述页面内容修订、乐观锁和快照。
- API、Patch Preview 和保存冲突统一使用 `pageVersion`。
- M1 完成后冻结首个正式 `schemaVersion: 1`。

## 备选方案

### 继续复用 `version`

拒绝。一个数字无法同时表达协议兼容性和页面内容修订，后续会导致错误迁移或冲突判断。

### 立即建设 V1 → V2 Migration Registry

拒绝。当前没有正式发布数据，会引入没有收益的双类型和兼容分支。

## 后果

- 需要一次性更新类型、DTO、Repository、fixtures、examples 和测试。
- 正式发布后，破坏性 Schema 变化必须增加 schemaVersion 和明确 migration。
- pageVersion 不再污染可移植的 PageSchema JSON。
