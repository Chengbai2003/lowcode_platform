# A2UI 目标架构

> Status: Draft  
> Last Updated: 2026-08-25  
> Target Milestone: M0 → M2

## 目标

平台最终形态是一个 Schema-Native 页面 Agent：Agent 只能通过受控工具产生最小 Patch；页面只能通过受限 Schema、表达式、Flow 和数据源能力运行；同一份受支持 Schema 在 Renderer 与 Compiler 中具有一致的可观察行为。

## 总体数据流

```text
用户指令 + 当前页面上下文
          ↓
Agent Router / Runner
          ↓
Component Manifest + 受控 Tool Registry
          ↓
最小 Patch
          ↓
Schema Validator → Component Validator → Policy Engine
          ↓
Patch Preview + 用户确认 + 版本/会话守卫
          ↓
Repository 原子保存
          ↓
PageSchema JSON
     ┌────┴────┐
     ↓         ↓
 Renderer    Compiler
     ↓         ↓
页面运行态   React 源码
```

## 核心领域对象

```ts
interface SystemRuntimeProfile {
  systemId: string;
  componentPresetId: string;
  componentPresetVersion: string;
  rendererVersion: string;
  compilerBindingId: string;
  status: 'active' | 'deprecated' | 'disabled';
}

interface StoredPageRecord {
  pageId: string;
  systemId: string;
  currentPageVersion: number;
  latestSnapshotId: string;
}

interface PageSnapshotRecord {
  snapshotId: string;
  pageId: string;
  pageVersion: number;
  schema: PageSchema;
  runtimeCompatibility: {
    componentPresetId: string;
    componentPresetVersion: string;
    rendererVersion: string;
  };
}

interface PageSchema {
  schemaVersion: 1;
  rootId: string;
  components: Record<string, ComponentNode>;
  logic: PageLogic;
}
```

`systemId` 必须由服务端依据 page/project 关系解析，不能信任 Agent 或客户端任意指定。

| 状态         | 新页面绑定 | 已绑定页面产生新快照 | 历史快照恢复                  |
| ------------ | ---------- | -------------------- | ----------------------------- |
| `active`     | 允许       | 允许                 | 精确三元组匹配时允许          |
| `deprecated` | 禁止       | 允许                 | 精确三元组匹配时允许          |
| `disabled`   | 禁止       | 禁止                 | 禁止运行，仅允许查看原始 JSON |

`StoredPageRecord` 只保存页面归属和当前版本指针；Schema 与运行时兼容三元组只存在于不可变 `PageSnapshotRecord`。`componentPresetId`、`componentPresetVersion` 和 `rendererVersion` 由服务端在保存时从可信 `SystemRuntimeProfile` 写入。系统升级 Preset 后，历史快照仍按原版本解析；若对应版本不可用，只允许查看原始 JSON，不得用当前 Preset 猜测性渲染、执行或编译。

## 包边界

```text
@lowcode-platform/schema-contract
  ├── PageSchema / ActionFlow / DataSource 类型
  └── 运行时 Validator

@lowcode-platform/renderer
  ├── React Schema Renderer
  ├── ComponentPreset 运行时接口
  ├── RuntimeSession
  ├── SafeEvaluator
  ├── ReactiveRuntime
  └── ActionFlow Executor

@lowcode-platform/preset-antd
  ├── Runtime Components
  ├── Component Manifest
  ├── Props Validator
  └── Compiler Bindings

packages/frontend
  └── Editor、Canvas、PropertyPanel、AI Assistant

packages/backend
  └── Agent、Validator、Policy、Repository、Compiler、Catalog、MCP
```

当前阶段不单独发布 `runtime-core`。只有在出现 Vue Renderer、Node Runtime 或其他非 React 消费端后，才评估从 Renderer 内部抽离。

## 单系统单组件库

一个 `SystemRuntimeProfile` 只能绑定一个 `ComponentPreset`。Renderer 不包含 AntD、Arco 等组件库条件判断，只调用统一接口：

```ts
interface ComponentPreset {
  id: string;
  version: string;
  runtime: ComponentRegistry;
  manifest: ComponentManifestRegistry;
  validation: ComponentValidationRegistry;
  compiler: ComponentCompilerRegistry;
}
```

新增组件库只新增一个 Preset 包和系统配置，不修改 Renderer、Compiler、Validator 或 Agent Runner 主流程。

## 六个消费面一致性

任何 DSL 能力必须同时覆盖：

1. Schema Contract：类型和结构定义。
2. Validator：结构、安全、引用和资源预算校验。
3. Editor/Agent Tools：创建、修改、删除和预览能力。
4. Renderer：解释执行。
5. Compiler：源码生成和导出运行。
6. Storage：版本、快照和事务语义。

能力只有在六个消费面全部支持后才能开放保存与发布。

## 页面运行链路

```text
系统 Shell 启动
  ↓
加载 Renderer Bundle 与当前系统 Preset（一次）
  ↓
封装不可变 Registry 与 Host Capabilities（一次）
  ↓
路由进入页面并请求 PageSchema JSON
  ↓
parse → validate → normalize → readonly schema
  ↓
创建独立 RuntimeSession
  ↓
渲染组件树并执行 Flow
  ↓
离开页面时 dispose Session
```

全局共享的是代码、不可变 Registry、协议常量和只读 Host Capability 包装；页面 State、Computed、Flow 栈、请求、timer、tracking cache 和订阅必须按 Session 隔离。

## Agent 修改链路

```text
pageId
  ↓
服务端解析 SystemRuntimeProfile
  ↓
Agent 只获得当前 Preset 的相关 Component Manifest
  ↓
受控 Tool Call 生成 Patch
  ↓
Patch Shape + Component Props + Schema Graph + Policy 校验
  ↓
绑定 sourcePageId / pageVersion / documentSessionId / schemaRevision
  ↓
Preview
  ↓
用户确认
  ↓
确认后再次校验上下文
  ↓
Repository CAS 保存
```

Agent Prompt 不是权限来源。即使模型输出错误类型、非法 Props 或危险流程，Validator 和 Executor 也必须 fail-close。

## Compiler 链路

Compiler 不判断组件库名称，而是通过当前 Preset 获取 import binding：

```ts
const binding = preset.compiler.resolve(component.type);
```

生成代码中的表达式、Flow 和 DataSource 调用仍然使用与 Renderer 一致的安全语义。DataSource 最终调用宿主受控 capability，不把内部 URL 和凭据写进生成源码。

## Host Capabilities

Renderer 默认不拥有宿主权限，必须显式注入最小能力：

```ts
interface HostCapabilities {
  navigate?: (target: string) => void;
  feedback?: (input: FeedbackInput) => void;
  executeDataSource?: (input: DataSourceRequest) => Promise<unknown>;
  requestConfirmation?: (input: ConfirmationRequest) => Promise<ConfirmationToken>;
}
```

所有 capability 必须通过不可变包装暴露，默认 deny，且不得把宿主对象、全局对象或任意函数放入表达式上下文。

## 发布边界

- M0：架构和质量地基可用。
- M1：首个正式 Schema V1、Renderer V1、ComponentPreset V1 可用。
- M2：允许连接企业真实接口和受控外部 Agent。
- M3+：在稳定存储、Eval 和 Policy 之上增加自主长任务。
