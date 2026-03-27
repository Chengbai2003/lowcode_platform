# @lowcode-platform/backend

> A2UI 低代码平台的后端服务。  
> 负责页面快照、页面理解、编辑工具、agent 编排、模型接入和代码导出。

## 服务职责

当前 backend 主要承担：

- 页面快照读写与版本控制
- 页面上下文切片与候选节点定位
- 低代码编辑工具注册、patch 校验、auto-fix、preview
- `answer / schema / patch` 路由与 bounded agent 执行
- AI Provider 接入、模型配置与通用聊天接口
- A2UI Schema -> React 代码导出

## 快速开始

在仓库根目录执行：

```bash
pnpm install
```

复制 `packages/backend/.env.example` 为 `packages/backend/.env`，至少配置：

```bash
API_SECRET=dev-secret-token-change-in-production
PORT=3001
```

如需调用模型，再补充：

```bash
AI_DEFAULT_PROVIDER=openai
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
OLLAMA_BASE_URL=http://localhost:11434
```

启动服务：

```bash
pnpm dev:backend
```

默认地址：

- `http://localhost:3001/api/v1`

补充说明：

- API 全局前缀是 `/api/v1`
- 核心接口默认需要 `Authorization: Bearer {API_SECRET}`
- 页面快照文件路径可通过 `PAGE_SCHEMA_FILE_PATH` 覆盖

## 核心模块

```text
src/modules/
├── page-schema/    # 页面快照保存、读取、版本冲突保护
├── schema-context/ # 页面理解、焦点切片、候选定位
├── agent-tools/    # 低代码编辑工具、preview/validate/auto-fix
├── agent/          # 路由、runner、memory、trace、replay、metrics
├── ai/             # Provider 接入、模型管理、通用 chat/schema 生成
├── compiler/       # Schema -> React 代码导出
└── common/         # auth、filter、interceptor 等基础设施
```

## 主要接口

### Agent

```http
POST /api/v1/agent/edit
POST /api/v1/agent/edit/stream
POST /api/v1/agent/patch/preview
GET  /api/v1/agent/traces/:traceId
GET  /api/v1/agent/traces/:traceId/replay
GET  /api/v1/agent/metrics/summary
```

### Page Schema

```http
PUT /api/v1/pages/:pageId/schema
GET /api/v1/pages/:pageId/schema
GET /api/v1/pages/:pageId/schema?version=xx
```

### AI / Models

```http
POST   /api/v1/ai/chat
POST   /api/v1/ai/chat/stream
POST   /api/v1/ai/generate-schema
POST   /api/v1/ai/generate-schema/stream
GET    /api/v1/ai/providers
GET    /api/v1/ai/providers/status
GET    /api/v1/ai/providers/:name/health
GET    /api/v1/ai/models
POST   /api/v1/ai/models
DELETE /api/v1/ai/models/:id
```

### AI Sessions

```http
GET    /api/v1/ai/sessions
GET    /api/v1/ai/sessions/:id
POST   /api/v1/ai/sessions
PUT    /api/v1/ai/sessions/:id
DELETE /api/v1/ai/sessions/:id
```

### Compiler

```http
GET  /api/v1/compiler/health
POST /api/v1/compiler/export
```

## 常用命令

```bash
pnpm --filter @lowcode-platform/backend dev
pnpm --filter @lowcode-platform/backend build
pnpm --filter @lowcode-platform/backend test
pnpm --filter @lowcode-platform/backend test:e2e
pnpm --filter @lowcode-platform/backend test:cov
pnpm --filter @lowcode-platform/backend test:compiler
pnpm --filter @lowcode-platform/backend compiler:regression
pnpm --filter @lowcode-platform/backend type-check
```

## 当前边界

- 页面快照当前仍是 file-backed store
- `ai/sessions` 当前是内存实现，只适合开发和测试
- 数据库与 Redis 配置目前仍主要是预留位
- `agent-runner.service.ts` 已经较大，后续继续扩展前需要拆职责

## 相关文档

- 根目录 `README.md`：项目整体说明
- 根目录 `project_summary.md`：当前仓库状态综述
- 根目录 `低代码平台-接入agent路线图.md`：阶段路线图

## License

MIT
