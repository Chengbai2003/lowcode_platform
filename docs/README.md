# A2UI 文档索引

> Status: Active  
> Last Updated: 2026-09-01

本目录是当前架构与演进方向的文档真相源。具体任务、负责人和实施进度以 GitHub Issues 与 Pull Requests 为准。

## 从这里开始

1. [`roadmap/a2ui-evolution-roadmap.md`](roadmap/a2ui-evolution-roadmap.md)：了解已完成的 M0、当前 M1 Foundation，以及 M1a～M5 的依赖和发布门槛。
2. [`architecture/target-architecture.md`](architecture/target-architecture.md)：了解目标系统、包边界和核心链路。
3. [`architecture/schema-contract.md`](architecture/schema-contract.md)：了解 DSL 单一真相源与版本边界。
4. [`architecture/renderer-and-component-preset.md`](architecture/renderer-and-component-preset.md)：了解独立 Renderer 和多组件库扩展方式。
5. [`architecture/security-boundaries.md`](architecture/security-boundaries.md)：了解不可突破的安全不变量。
6. [`adr/README.md`](adr/README.md)：了解已经接受的架构决策及其原因。

## 文档职责

| 文档类型     | 负责内容                              | 不负责内容       |
| ------------ | ------------------------------------- | ---------------- |
| Roadmap      | 方向、阶段、依赖、发布门槛、Epic 状态 | Issue 级任务细节 |
| Architecture | 当前认可的目标结构、边界和跨模块约束  | 单次实现过程     |
| ADR          | 一个重要决策的背景、取舍与后果        | 持续变化的进度   |
| GitHub Issue | 范围、任务、验收标准、负责人和状态    | 长期架构真相     |
| Pull Request | 具体代码与文档变更、验证证据          | 未来路线承诺     |

## 更新规则

- 架构类变更必须同步相应 Architecture 文档；改变已接受决策时新增 ADR，并将旧 ADR 标记为 `Superseded`。
- Roadmap 只登记 Epic 状态和 Issue 链接，不复制 Issue 的全部清单。
- 新 DSL 能力必须同时说明 Contract、Validator、Editor/Agent、Renderer、Compiler、Storage 六个消费面的支持情况。
- 安全边界只能通过明确 ADR 调整，不能在单个实现 PR 中隐式放宽。
- 根目录的旧 Phase 文档保留作历史追溯，不再作为当前实现依据。
