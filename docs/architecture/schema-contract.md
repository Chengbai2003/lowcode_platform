# Schema Contract 设计原则

> Status: Implemented for M0; M1a State and Computed in progress
> Last Updated: 2026-09-03
> Target Milestone: M1a-1

## 当前决策

M0 的 Contract 是唯一 Schema 类型与校验来源。当前唯一支持的 DSL 版本为
`schemaVersion: 0`；不支持的版本和未知顶层字段均 fail-close。

## 版本职责

```ts
interface PageSchema {
  schemaVersion: 0;
  rootId: string;
  components: Record<string, ComponentNode>;
  logic?: PageLogic;
}

interface PageLogic {
  states?: Record<string, JsonValue>;
  computed?: Record<string, string>;
}

interface StoredPageRecord {
  pageId: string;
  systemId: string;
  currentPageVersion: number;
}

interface PageSnapshotRecord {
  pageId: string;
  pageVersion: number;
  schema: Readonly<PageSchema>;
  runtimeCompatibility: {
    componentPresetId: string;
    componentPresetVersion: string;
    rendererVersion: string;
  };
}
```

- `schemaVersion` 描述 DSL 格式。
- `pageVersion` 描述页面内容修订，用于乐观锁、Patch Preview 和快照。
- `runtimeCompatibility` 随不可变 `PageSnapshotRecord` 持久化，用于历史复现。
- Repository 不再通过修改 Schema 的协议版本表达页面修订。

M0 服务端将 `systemId: default` 固定映射到唯一可信的内置 Profile；持久化的版本字段不能由客户端或 Agent 自报。恢复历史快照时必须使用快照记录的精确 Preset/Renderer 版本，不可用时 fail-close 为原始 JSON 只读。多系统和外部 Preset 的通用解析由 [M1F-2 SystemRuntimeProfile Registry](https://github.com/Chengbai2003/lowcode_platform/issues/39) 承接，不能把未来 Registry 描述成当前已实现能力。

## 基础结构

```ts
type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

interface ComponentNode {
  id: string;
  type: string;
  props?: Record<string, JsonValue>;
  events?: Record<string, ActionList>;
  childrenIds?: string[];
}

type ActionList = Action[];
```

M1a-1 已将 State Declaration 与 Computed Declaration 纳入 Draft Contract：
`logic.states` 只保存 RuntimeSession 初值，Session State 变化不回写 Schema；
`logic.computed` 只保存不带 `{{ }}` 的安全表达式，不保存求值结果或依赖元数据。
ActionFlow 与 DataSource 尚未进入 Contract；在对应切片完成六消费面闭环时再加入。

Computed 的唯一共享分析入口负责解析受限 AST、校验命名空间/运算符/纯函数、提取顶层
State 与直接 Computed 依赖，并输出稳定拓扑。缺失引用、动态成员、危险原型字段、宿主或
构造器访问、循环、表达式/AST/依赖图超预算均 fail-close。Renderer 与 Compiler 只消费该
分析结果，不自行建立更宽松的语法或依赖规则。

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
验证 Page Logic 结构、Logic Key、State/Computed 资源预算与 Computed DAG
  ↓
验证 Schema 结构和组件图
  ↓
按 SystemProfile 解析 ComponentPreset
  ↓
验证组件类型、Props 和事件
  ↓
验证表达式、ActionList 和资源预算
  ↓
生成 canonical readonly PageSchema
```

禁止 Renderer、Compiler、Repository 或 Agent Tool 绕过该入口直接消费 raw object。

## Fail-close 规则

以下情况拒绝保存、渲染、执行和编译：

- 不支持的 `schemaVersion`
- 未知顶层字段或非法命名空间
- 非法 Page Logic 字段、危险 Logic Key 或超出 State/Computed/JSON 资源预算
- Computed 缺失引用、动态访问、宿主/构造器能力、循环依赖或只读命名空间写入
- 组件图成环、多父、重复 child 或孤儿节点
- 组件类型不在当前 System Preset 中
- Props 不符合 Manifest 或包含危险值
- 表达式包含不支持 AST、危险属性或超出预算
- ActionList 结构非法、动作超出预算或表达式包含危险路径

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

---

## 实施状态（2026-09）

M0-1 已完成：Contract 为唯一 Schema 类型与校验来源（PR #20/#22/#23/#24，Issue #16）。消费面（Editor、Renderer、Compiler、Agent、SchemaContext、Repository）直接导入 Contract；Renderer 挂载边界、Repository 磁盘/写入边界与 Compiler 入口使用 `requireSupportedPageSchema` 做 fail-close 校验并只消费返回值；渲染树内部使用 canonical 的工作副本（reactive 运行时可写，深冻结语义由 M0-4 RuntimeSession 承接），持久化对象保持深冻结；`pnpm check:architecture` 强制架构边界。
