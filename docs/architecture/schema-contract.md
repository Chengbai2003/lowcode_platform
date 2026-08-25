# Schema Contract 设计原则

> Status: Draft  
> Last Updated: 2026-08-25  
> Target Milestone: M0-1 / M1

## 当前决策

项目尚未正式发布，没有需要长期兼容的生产 Schema。当前结构被视为开发期 Draft，仓库内 fixtures、examples 和本地数据可以一次性升级，不建设通用 V1 → V2 migration registry。

M0 建立版本边界和单一真相源；M1 完成后冻结首个正式 Schema V1。正式发布后出现破坏性协议变化时，再建设逐版本 migration chain。

## 版本职责

```ts
interface PageSchema {
  schemaVersion: 1;
  rootId: string;
  components: Record<string, ComponentNode>;
  logic: PageLogic;
}

interface PageRecord {
  pageId: string;
  systemId: string;
  pageVersion: number;
  componentPresetId: string;
  componentPresetVersion: string;
  rendererVersion: string;
  schema: PageSchema;
}
```

- `schemaVersion` 描述 DSL 格式。
- `pageVersion` 描述页面内容修订，用于乐观锁、Patch Preview 和快照。
- `componentPresetId`、`componentPresetVersion` 和 `rendererVersion` 随每个页面版本及快照持久化，用于历史复现。
- Repository 不再通过修改 Schema 的协议版本表达页面修订。

运行时仍由服务端根据 `systemId` 解析当前可信 `SystemRuntimeProfile`；持久化的版本字段不能由客户端或 Agent 自报。恢复历史快照时必须使用快照记录的精确 Preset/Renderer 版本，不可用时 fail-close 为原始 JSON 只读。

## 基础结构

```ts
type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

interface ComponentNode {
  id: string;
  type: string;
  props?: Record<string, JsonValue>;
  events?: Record<string, FlowBinding>;
  childrenIds?: string[];
}

interface FlowBinding {
  flowId: string;
  input?: Record<string, JsonValue>;
}

interface PageLogic {
  states: Record<string, StateDefinition>;
  computed: Record<string, ComputedDefinition>;
  flows: Record<string, ActionFlow>;
  dataSources: Record<string, DataSourceDefinition>;
}
```

具体 State、Computed、ActionFlow 和 DataSource 联合类型在对应 M1 Issue 中冻结，但必须继续由同一 contract 包导出。

## 统一组件协议与 Props

平台统一组件节点、事件、子树和表达式语义，不强行把所有组件库 Props 压缩成最低公共子集。

一个系统固定一个 ComponentPreset。节点 `type` 使用统一逻辑名称，具体允许的 Props 由当前 Preset Manifest 决定。Props 可以透传给组件实现，但必须先经过 Manifest 校验和安全过滤。

以下字段默认禁止从 JSON 透传：

- `dangerouslySetInnerHTML`
- `ref`、`key`、直接覆盖 `children`
- 任意函数值
- 任意未声明的 `onXxx` 和 `renderXxx`
- `component`、`getPopupContainer` 等函数型扩展点
- Symbol、BigInt、类实例、getter/setter
- Manifest 未声明的未知属性

## 入口管道

所有入口使用同一条管道：

```text
parse raw JSON
  ↓
检查 JSON 可序列化性、大小和基础资源预算
  ↓
验证 schemaVersion
  ↓
验证 Schema 结构和组件图
  ↓
按 SystemProfile 解析 ComponentPreset
  ↓
验证组件类型、Props 和事件
  ↓
验证表达式、Flow、DataSource 和 Policy
  ↓
生成 canonical readonly PageSchema
```

禁止 Renderer、Compiler、Repository 或 Agent Tool 绕过该入口直接消费 raw object。

## Fail-close 规则

以下情况拒绝保存、渲染、执行和编译：

- 不支持的 `schemaVersion`
- 未知顶层字段或非法命名空间
- 组件图成环、多父、重复 child 或孤儿节点
- 组件类型不在当前 System Preset 中
- Props 不符合 Manifest 或包含危险值
- 表达式包含不支持 AST、危险属性或超出预算
- Flow 引用缺失、循环失控或危险路径未确认
- DataSource 引用无法通过可信 OperationResolver 解析

未来遇到高于当前实现的正式 Schema 版本时，可以提供“原始 JSON 只读查看”，但不得渲染、执行、编译或再次保存。

## 一致性要求

Contract fixture 必须被以下消费面共同使用：

- Backend Schema Validator
- Agent Patch Validator
- Frontend Editor
- Renderer
- Compiler
- Repository

禁止复制类型后各自演进。任何新增字段的 PR 必须同时包含消费面支持矩阵和跨层回归测试。

## 正式发布前策略

- 允许一次性 breaking change。
- 不保留双 Schema、双 Renderer 或长期兼容分支。
- 修改 Contract 时同步更新全部 fixtures、examples 和测试。
- M1b 完成后冻结 Schema V1；冻结后破坏性变化必须通过新 schemaVersion 和明确 migration 处理。
