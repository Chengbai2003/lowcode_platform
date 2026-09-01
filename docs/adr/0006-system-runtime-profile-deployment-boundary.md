# ADR-0006：SystemRuntimeProfile 属于部署可信边界

> Status: Accepted
> Date: 2026-09-01

## 背景

`RuntimeCompatibility` 需要随页面快照持久化，以精确复现历史页面；但它不能携带服务端的可信 Compiler 导入绑定，也不能允许客户端或 Agent 选择任意系统运行时。内置 AntD 已完成单一 Profile 闭环，外部 Preset 需要一个明确的部署边界，不能通过 PageSchema 扩展字段或前端组合 Preset 伪装为可信运行时。

## 决策

在 Backend/Deployment 边界定义：

```ts
interface SystemRuntimeProfile {
  systemId: string;
  componentPresetId: string;
  componentPresetVersion: string;
  rendererVersion: string;
  compilerBindingId: string;
  status: 'active' | 'deprecated' | 'disabled';
}
```

- `RuntimeCompatibility` 仍是 PageSnapshot 唯一持久化的运行时数据，严格只含 Preset/Renderer 精确三元组；它由 Profile 的同名三字段投影而来。
- `SystemRuntimeProfile`、`compilerBindingId`、import path 与可执行 binding 都只属于服务端部署配置，不进入 PageSchema、Snapshot 或客户端/Agent DTO。
- `systemId` 由服务端根据页面或项目关系取得；客户端与 Agent 不可声明或覆盖它。
- Profile 第一版是部署静态配置，不引入数据库、动态 import、Registry/Catalog 或单实现 Factory。

生命周期是可执行的发布规则：

| 状态         | 新页面绑定 | 已绑定页面产生新快照 | 历史快照的预览与编译                     |
| ------------ | ---------- | -------------------- | ---------------------------------------- |
| `active`     | 允许       | 允许                 | 精确三元组匹配时允许                     |
| `deprecated` | 禁止       | 允许                 | 精确三元组匹配时仍允许                   |
| `disabled`   | 禁止       | 禁止                 | 拒绝预览、执行和编译；仅可原始 JSON 只读 |

## B2 的职责边界

后续 Registry 必须提供两条不同的可信解析路径：

1. 由服务器已知 `systemId` 选择该系统当前可新建页面的 `active` Profile。
2. 由已绑定页面或不可变 Snapshot 的 `RuntimeCompatibility` 精确匹配 Profile，用于已有页面继续保存，以及快照恢复、渲染和编译；不可回退到最新 Profile。

未知 Profile、禁用 Profile 或任一版本不匹配全部 fail-close。`compilerBindingId` 是部署侧 binding 的标识，B1 不消费它；B2 在第二条路径解析完成后才由服务端使用。

## 备选方案

### 把 Profile 与 Compiler Binding 放入 PageSchema

拒绝。客户端 JSON 会成为代码加载或可信导入的输入，破坏安全边界。

### 先做数据库驱动的动态 Registry

拒绝。当前只有一个内置部署 Profile；在出现第二个可信 Preset 前没有必要增加动态配置、迁移和代码加载面。

### 对历史版本静默回退到当前 Profile

拒绝。会使快照显示为可恢复但实际使用另一套 Manifest、Renderer 或 Compiler 绑定。

## 后果

- B1 仅引入领域契约与静态内置 Profile，现有 M0 三元组解析不改变。
- B2 实现 Backend Registry 与 Frontend RendererPresetCatalog，但二者不得相互泄漏可执行 binding。
- B3 让页面保存、快照读取、Editor、Renderer、Compiler 与 Agent Manifest 复用同一解析结果。
