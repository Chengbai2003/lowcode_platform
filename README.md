# A2UI 低代码平台

> 一个围绕 **A2UI Schema** 构建的低代码编辑器与页面编辑 Agent。  
> 当前状态：**M0 工程与运行时地基已完成，进入 M1 Foundation 与 M1a 演进阶段**。

## 项目概览

这个仓库的核心包包括：

- `packages/schema-contract`：A2UI Schema 类型、版本与统一校验边界
- `packages/renderer`：可独立消费的 Renderer、RuntimeSession 与 HostCapabilities
- `packages/preset-antd`：内置 AntD Runtime、Manifest、Validation 与 Compiler bindings
- `packages/frontend`：编辑器、AI 助手与 Preview 宿主
- `packages/backend`：页面快照、Agent 编排、工具层与代码导出

当前主线能力可以简单理解为：

- `schema`：冷启动生成页面初稿
- `patch`：在已有页面上做受控微调

## 快速开始

环境要求：

- Node.js >= 22
- pnpm >= 11

安装依赖：

```bash
pnpm install
```

最小配置：

`packages/backend/.env`

```bash
API_SECRET=dev-secret-token-change-in-production
```

`packages/frontend/.env.local`

```bash
VITE_API_SECRET=dev-secret-token-change-in-production
VITE_API_BASE_URL=http://localhost:3001
```

启动开发环境：

```bash
# terminal 1
pnpm dev:backend

# terminal 2
pnpm dev
```

默认地址：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:3001`

常用命令：

```bash
pnpm dev
pnpm dev:backend
pnpm build
pnpm build:backend
pnpm type-check
pnpm lint
pnpm format
pnpm --filter @lowcode-platform/frontend test
pnpm --filter @lowcode-platform/backend test
```

## 仓库入口

```text
packages/
├── schema-contract/                # Schema 单一真相源
├── renderer/                       # 独立 Renderer 与运行时执行
├── preset-antd/                    # 内置 AntD ComponentPreset
├── frontend/
│   ├── src/editor/                 # 编辑器与 AI 助手主链路
│   └── src/components/             # 编辑器组件元数据与面板
└── backend/
    ├── src/modules/page-schema/    # 页面快照读写与版本控制
    ├── src/modules/schema-context/ # 页面理解与焦点切片
    ├── src/modules/agent-tools/    # 低代码编辑工具与 patch 守门能力
    ├── src/modules/agent/          # 路由、runner、memory、trace、metrics
    ├── src/modules/ai/             # 模型 Provider 接入
    └── src/modules/compiler/       # Schema -> React 导出
```

建议从这些文件开始读：

- `packages/schema-contract/src/index.ts`
- `packages/renderer/src/Renderer.tsx`
- `packages/preset-antd/src/createAntdPreset.ts`
- `packages/frontend/src/editor/LowcodeEditor.tsx`
- `packages/frontend/src/editor/components/ai-assistant/AIAssistant/useAIAssistantChat.ts`
- `packages/backend/src/modules/agent/agent.service.ts`
- `packages/backend/src/modules/agent/agent-runner.service.ts`
- `packages/backend/src/modules/agent-tools/tool-registry.service.ts`

## 当前边界

- 页面快照、版本与 CAS 语义已落地，但底层仍是 file-backed store
- Schema 类型和校验由 `@lowcode-platform/schema-contract` 统一提供
- Renderer 已成为独立 Package；内置可信运行时固定为 `builtin-antd / 0.1.0 / renderer 1.0.0`
- Deterministic Eval 已进入 CI；生产 Agent Replay 与 Live Trend Contract 由 [#38](https://github.com/Chengbai2003/lowcode_platform/issues/38) 承接
- 外部 Preset 的服务端 Registry 与 Frontend Catalog 由 [#39](https://github.com/Chengbai2003/lowcode_platform/issues/39) 承接
- M1a State & Computed 可与两个 M1 Foundation Epic 并行推进

## 文档入口

- [`docs/README.md`](docs/README.md)：当前有效文档索引与真相源说明
- [`docs/roadmap/a2ui-evolution-roadmap.md`](docs/roadmap/a2ui-evolution-roadmap.md)：M0～M5 完整演进路线、阶段门槛与 Epic 清单
- [`docs/architecture/target-architecture.md`](docs/architecture/target-architecture.md)：目标架构、包边界与六端一致性原则
- [`docs/architecture/schema-contract.md`](docs/architecture/schema-contract.md)：Schema Contract、版本边界与 fail-close 规则
- [`docs/architecture/renderer-and-component-preset.md`](docs/architecture/renderer-and-component-preset.md)：独立 Renderer、单系统单组件库与 RuntimeSession 隔离
- [`docs/architecture/security-boundaries.md`](docs/architecture/security-boundaries.md)：Schema、Agent、Renderer、DataSource 与 MCP 安全边界
- [`docs/adr/README.md`](docs/adr/README.md)：已接受的架构决策记录
- [`packages/backend/README.md`](packages/backend/README.md)：后端服务说明

根目录中的 `project_summary.md`、阶段路线图与 Phase 执行计划保留作历史追溯，不再作为当前架构真相源。
