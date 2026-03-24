# A2UI 低代码平台

> 基于 **A2UI Schema** 的 AI 驱动低代码平台  
> 当前代码状态已推进到 **Agent Phase 6.4**：支持页面快照、Patch 编辑、SSE 状态流、澄清 / 语义确认 / 范围确认，以及 Trace / Replay / Metrics 调试链路。

---

## 1. 项目简介

这个项目的目标不是单纯“让 AI 生成一整页 JSON”，而是逐步建立一个：

> **围绕页面快照、局部上下文和工具调用的受控页面编辑 Agent**

当前仓库已经具备：

- 前端低代码编辑器：画布、组件树、属性面板、撤销重做
- 前端 AI 助手：聊天、流式状态、patch 预览、确认卡片、历史记录
- 后端页面快照接口：`pageId + version` 保存 / 读取 / 冲突保护
- 后端工具链：页面上下文、节点定位、Patch 校验、auto-fix、preview
- 后端 Agent：`answer / schema / patch` 路由、批量确认、trace / replay / metrics
- Schema 编译器：A2UI Schema → React 代码

> 当前仍有一个重要未完成项：  
> 页面快照虽然已经有接口和版本机制，但底层仍以文件存储为主，尚未完全切到路线图中规划的数据库化快照表。

---

## 2. 当前能力概览

### 编辑器侧

- 页面预览与组件树联动
- 属性面板动态编辑
- 历史记录、撤销 / 重做
- 本地 Schema 校验与 auto-fix
- Patch 应用与命令体系承接

### AI 助手侧

- Auto / Answer / Schema / Patch 模式
- `/agent/edit/stream` 流式状态事件
- 节点歧义澄清（clarification）
- 集合编辑语义确认（intent confirmation）
- 批量范围确认（scope confirmation）
- patch 预览与本地应用
- trace 时间线 / 最近工具 / 错误码展示

### 后端 Agent 侧

- 页面快照读取与版本校验
- schema-context 局部上下文切片
- function-calling 风格工具层
- patch validate / auto-fix / preview
- 会话短记忆、只读缓存、patch 幂等复用
- trace / replay / metrics summary

---

## 3. 仓库结构

```text
packages/
├── frontend/                 # 前端整合包
│   ├── src/editor/           # 编辑器、AI 助手、命令系统
│   ├── src/renderer/         # 运行时渲染器、DSL 执行引擎
│   ├── src/components/       # 组件库与元数据
│   ├── src/schema/           # Schema 校验与 auto-fix
│   └── src/types/            # A2UI Schema / DSL 等基础类型
│
└── backend/                  # 后端服务
    ├── src/modules/page-schema/   # 页面快照保存/读取/版本控制
    ├── src/modules/schema-context/ # 页面理解与焦点切片
    ├── src/modules/agent-tools/    # Patch 工具层与守门工具
    ├── src/modules/agent/          # Agent 编排、trace、metrics、replay
    ├── src/modules/ai/             # 多模型 Provider 封装
    └── src/modules/compiler/       # Schema -> React 代码编译
```

---

## 4. 核心架构

### 4.1 页面保存链路

```text
LowcodeEditor
  -> pageSchemaApi.savePageSchema
  -> PUT /api/v1/pages/:pageId/schema
  -> PageSchemaService
  -> PageSchemaRepository（当前 file-backed）
  -> 返回 version / snapshotId
```

### 4.2 AI 编辑链路

```text
用户输入 instruction + 当前 selectedId
  -> useAIAssistantChat
  -> ServerAIService
  -> /api/v1/agent/edit 或 /api/v1/agent/edit/stream
  -> AgentRoutingService（answer/schema/patch）
  -> AgentRunnerService
  -> schema-context + agent-tools
  -> 返回 answer / schema / patch / clarification / intent_confirmation / scope_confirmation
```

### 4.3 批量编辑双阶段确认链路

```text
“把所有字段的 label 宽度改成 200”
  -> 语义归一化（字段 / 输入框 / 表单项）
  -> intent_confirmation（先确认你说的是哪一类组件）
  -> resolve_collection_scope
  -> scope_confirmation（再确认这批组件范围）
  -> 才进入 batch patch 生成
```

### 4.4 调试与观测链路

```text
Agent 请求
  -> trace 记录 route/status/tool/result/error
  -> GET /api/v1/agent/traces/:traceId
  -> GET /api/v1/agent/traces/:traceId/replay
  -> GET /api/v1/agent/metrics/summary
```

---

## 5. 快速开始

### 环境要求

- Node.js >= 18
- pnpm >= 8

### 安装依赖

```bash
pnpm install
```

### 启动开发环境

> 当前根脚本 `pnpm dev` 只启动前端；后端需要单独起一个终端。

终端 1：启动后端

```bash
pnpm dev:backend
```

终端 2：启动前端

```bash
pnpm dev
```

默认访问：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:3000`

---

## 6. 认证与本地配置

后端 Agent / AI 相关接口默认经过鉴权。

### 后端环境变量

在 `packages/backend/.env` 中至少配置：

```bash
API_SECRET=dev-secret-token-change-in-production
```

### 前端环境变量

在 `packages/frontend/.env.local` 中至少配置：

```bash
VITE_API_SECRET=dev-secret-token-change-in-production
```

### 可选：页面快照文件位置

当前页面快照默认写入后端运行目录下的 `page-schema-store.json`。  
按当前开发命令，一般会落在 `packages/backend/page-schema-store.json`。  
如需自定义，可设置：

```bash
PAGE_SCHEMA_FILE_PATH=/absolute/path/to/page-schema-store.json
```

---

## 7. 常用命令

```bash
# 前端开发
pnpm dev

# 后端开发
pnpm dev:backend

# 构建
pnpm build
pnpm build:backend

# 类型检查
pnpm type-check

# 测试
pnpm --filter @lowcode-platform/frontend test
pnpm --filter @lowcode-platform/backend test
pnpm --filter @lowcode-platform/backend test:e2e

# 代码质量
pnpm lint
pnpm format
```

---

## 8. 关键接口

### 页面快照接口

```http
PUT /api/v1/pages/:pageId/schema
GET /api/v1/pages/:pageId/schema
GET /api/v1/pages/:pageId/schema?version=xx
```

### Agent 接口

```http
POST /api/v1/agent/edit
POST /api/v1/agent/edit/stream
POST /api/v1/agent/patch/preview
GET  /api/v1/agent/traces/:traceId
GET  /api/v1/agent/traces/:traceId/replay
GET  /api/v1/agent/metrics/summary
```

### 典型 Agent 请求结构

```json
{
  "pageId": "page-1",
  "version": 7,
  "instruction": "把这个按钮改成提交",
  "selectedId": "button_submit",
  "responseMode": "auto"
}
```

---

## 9. 当前路线图状态

根据 `低代码平台-接入agent路线图.md`，当前仓库大致处于：

| 阶段 | 状态 |
| --- | --- |
| Phase 1 页面快照基础设施 | 部分完成（接口与版本机制已落地，数据库化未完成） |
| Phase 2 局部上下文能力 | 已完成 |
| Phase 3 工具层与 patch 协议 | 已完成 |
| Phase 4 bounded Agent | 已完成 |
| Phase 5 前端 patch 主链路 | 已完成 |
| Phase 6.1 ~ 6.4 | 已完成当前一轮实现 |

### 接下来最重要的方向

1. 把页面快照从文件存储切到正式数据库
2. 扩展 Agent 评测集与长期指标沉淀
3. 给 Trace / Replay 增加更产品化的前端查看能力

---

## 10. 文档入口

- `README.md`：对外说明、运行方式、接口与当前能力
- `project_summary.md`：当前仓库的真实状态总结
- `低代码平台-接入agent路线图.md`：完整路线图与阶段目标
- `低代码平台-Agent-Phase6.4-执行计划.md`：Phase 6.4 的实施记录

---

## 11. License

MIT
