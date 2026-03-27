# A2UI 低代码平台

> 一个围绕 **A2UI Schema** 构建的低代码编辑器与页面编辑 Agent。  
> 当前状态：**Agent Phase 6.4 已落地**。

## 项目概览

这个仓库由两部分组成：

- `packages/frontend`：编辑器、AI 助手、patch 本地应用
- `packages/backend`：页面快照、agent 编排、工具层、代码导出

当前主线能力可以简单理解为：

- `schema`：冷启动生成页面初稿
- `patch`：在已有页面上做受控微调

## 快速开始

环境要求：

- Node.js >= 18
- pnpm >= 8

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
├── frontend/
│   ├── src/editor/                 # 编辑器与 AI 助手主链路
│   ├── src/renderer/               # 运行时渲染与 DSL 执行
│   ├── src/components/             # 组件库与元数据
│   └── src/schema/                 # Schema 校验与 auto-fix
└── backend/
    ├── src/modules/page-schema/    # 页面快照读写与版本控制
    ├── src/modules/schema-context/ # 页面理解与焦点切片
    ├── src/modules/agent-tools/    # 低代码编辑工具与 patch 守门能力
    ├── src/modules/agent/          # 路由、runner、memory、trace、metrics
    ├── src/modules/ai/             # 模型 Provider 接入
    └── src/modules/compiler/       # Schema -> React 导出
```

建议从这些文件开始读：

- `packages/frontend/src/editor/LowcodeEditor.tsx`
- `packages/frontend/src/editor/components/ai-assistant/AIAssistant/useAIAssistantChat.ts`
- `packages/backend/src/modules/agent/agent.service.ts`
- `packages/backend/src/modules/agent/agent-runner.service.ts`
- `packages/backend/src/modules/agent-tools/tool-registry.service.ts`

## 当前边界

- 页面快照已有接口和版本语义，但底层仍是 file-backed store
- Agent 主链路已成型，但 `Domain Pack` 仍分散在工具、prompt、规则和元数据里
- `agent-runner.service.ts` 与 `useAIAssistantChat.ts` 已经偏大，后续扩展前需要拆职责

## 文档入口

- `project_summary.md`：当前仓库状态与架构判断
- `packages/backend/README.md`：后端服务说明
- `低代码平台-接入agent路线图.md`：完整路线图
- `低代码平台-Agent-Phase6.4-执行计划.md`：Phase 6.4 实施记录
