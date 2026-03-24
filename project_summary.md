# A2UI 低代码平台项目综述

> **最后更新时间**：2026-03-24  
> **仓库形态**：2 包 Monorepo（`packages/frontend` + `packages/backend`）  
> **当前实现状态**：Agent Phase 6.4 已完成，页面快照数据库化仍待继续推进

---

## 一、项目一句话定位

这是一个围绕 **A2UI Schema** 构建的 **AI 驱动低代码平台**：  
前端负责编辑器、画布预览、属性面板与 AI 助手交互；后端负责页面快照、Schema 上下文切片、Patch 工具链、Bounded Agent 编排，以及 AI 模型接入。

当前项目已经不只是“让 AI 生成一整页 JSON”，而是进入了：

> **基于页面快照、选中组件和工具调用的受控页面编辑 Agent**

但距离路线图里的最终目标仍有一个关键差距：

> **页面快照目前已具备接口与版本机制，但底层仍以文件存储为主，尚未切到正式数据库表（`pages` / `page_schema_snapshots`）**

---

## 二、当前仓库真实状态

### 1. 前端编辑器主链路已成型

当前前端已经具备完整的低代码编辑器基础设施：

- 画布预览、组件树、属性面板、模板
- 命令历史与撤销 / 重做
- 本地 Schema 校验与 auto-fix
- Patch 应用器与 `createPatchCommand`
- AI 浮动岛、聊天区、历史记录、模型设置

这意味着：**前端不再需要整体重构**，后续 Agent 能力主要是在现有编辑器之上继续增强，而不是推倒重来。

### 2. 页面快照接口已经具备，但持久化仍是过渡实现

后端已经有：

- `PageSchemaModule`
- `PUT /pages/:pageId/schema`
- `GET /pages/:pageId/schema`
- `GET /pages/:pageId/schema?version=xx`
- 基于 `pageId + version` 的版本递增与冲突校验

但当前 `PageSchemaRepository` 仍通过 `page-schema-store.json` 做文件持久化；按现有开发命令，默认文件通常位于 `packages/backend/page-schema-store.json`。这属于**Phase 1 的过渡落地**，还不是路线图里最终建议的数据库化快照存储。

### 3. `schema-context` 和 patch 工具链已经落地

路线图里从“读懂页面”到“把修改收敛成 patch”的中层能力，现在已经具备：

- `schema-context`：页面理解、焦点组件切片、候选节点定位
- `agent-tools`：读工具、写工具、校验工具、auto-fix、patch preview
- `collection-target-resolver`：集合编辑目标解析
- 前端 `patchAdapter`：将后端 patch 映射到本地编辑命令体系

这部分能力说明项目已经不再依赖“整页 Schema 替换”作为唯一 AI 修改方式。

### 4. Bounded Agent 主链路已推进到 Phase 6.4

结合最近代码与测试，当前 Agent 能力已经覆盖：

- `auto / answer / schema / patch` 模式路由
- `POST /agent/edit` 与 `POST /agent/edit/stream`
- 流式 SSE 状态事件
- Patch 预览与结构化错误返回
- 节点歧义澄清（clarification）
- 批量范围确认（scope confirmation）
- 集合编辑语义确认（intent confirmation）
- 会话级短记忆、只读缓存、patch 幂等复用
- Trace、Replay、Metrics Summary 调试链路

也就是说，当前仓库已经从路线图早期的“AI Schema 生成器”推进到了：

> **一个具备受限工具调用、状态流、确认链路与调试可观测性的页面编辑 Agent**

---

## 三、当前推荐理解方式：不是理想图，而是“已落地 + 未补齐”

### 已落地的部分

#### 前端

- `LowcodeEditor` 已承接 `pageId` / `pageVersion`
- `pageSchemaApi` 已接入页面保存与读取
- `AIAssistant` 已接入后端 Agent
- `useAIAssistantChat` 已支持：
  - auto / answer / schema / patch
  - SSE 流式回退
  - clarification / intent confirmation / scope confirmation
  - patch 预览与本地应用
  - trace 信息聚合展示

#### 后端

- `page-schema` 模块：页面快照接口与版本冲突保护
- `schema-context` 模块：焦点上下文与候选定位
- `agent-tools` 模块：读写工具、preview、validate、auto-fix
- `agent` 模块：Agent 编排、路由、会话记忆、trace、metrics、replay
- `ai` 模块：多 Provider 模型接入
- `compiler` 模块：Schema → React 代码导出

### 尚未真正完成的部分

#### 1. 页面快照数据库化

路线图里建议的：

- `pages`
- `page_schema_snapshots`

目前还没有真正落到数据库层；现阶段更像是**“具备接口和版本语义的文件快照存储”**。

#### 2. 更完整的 Agent 评测 / 观测闭环

虽然当前已有：

- trace
- replay
- metrics
- Phase 6.4 样本回归测试

但仍缺：

- 更系统的评测数据集管理
- 更长期的指标归档
- 前端可视化 replay / trace 详情页

#### 3. 更正式的工程化与发布链路

当前已有基本 lint / format / test 脚本，但仍待继续推进：

- GitHub Actions / CI
- 发布与版本策略
- 文档与环境配置进一步标准化

---

## 四、与路线图的对照关系

基于 `低代码平台-接入agent路线图.md`，当前状态可概括为：

| 阶段 | 路线图目标 | 当前状态 |
| --- | --- | --- |
| Phase 0 | 对齐当前实现与目标架构 | 已完成 |
| Phase 1 | 页面快照基础设施 | **部分完成**：接口、版本机制、文件持久化已落地；数据库化未完成 |
| Phase 2 | resolved schema 与局部上下文能力 | 已完成 |
| Phase 3 | 工具层与 patch 协议 | 已完成 |
| Phase 4 | bounded Agent 与 function calling | 已完成 |
| Phase 5 | 前端 patch 主链路接入 | 已完成 |
| Phase 6.1 | 模式路由与前端状态流 | 已完成 |
| Phase 6.2 | 结果预览、澄清与安全护栏 | 已完成 |
| Phase 6.3 | 稳定性与效率优化 | 已完成 |
| Phase 6.4 | 语义确认、回放、评测闭环 | **当前已完成第一轮落地** |

最重要的现实判断是：

> 当前项目在 Agent 能力上已经明显领先于最初“后端持页能力”的成熟度。  
> 也就是说，**Agent 主链路已经跑起来了，但页面快照底层存储还需要继续从文件方案升级到正式存储方案。**

---

## 五、当前系统的核心执行链路

### 1. 页面保存链路

```text
前端编辑器
  -> pageSchemaApi.savePageSchema
  -> PUT /pages/:pageId/schema
  -> PageSchemaService
  -> PageSchemaRepository（当前为 file-backed store）
  -> 返回 pageId / version / snapshotId
```

### 2. Agent 编辑链路

```text
用户输入 instruction + 当前 selectedId
  -> useAIAssistantChat
  -> ServerAIService
  -> /agent/edit 或 /agent/edit/stream
  -> AgentRoutingService 判断 answer/schema/patch
  -> AgentRunnerService 调用 schema-context / tools
  -> 生成 patch / clarification / intent_confirmation / scope_confirmation
  -> 前端接收结果并决定渲染消息、确认、预览或应用 patch
```

### 3. 批量编辑确认链路

```text
用户说“把所有字段……”
  -> intent normalization
  -> 多义时返回 intent_confirmation
  -> 用户确认“表单项 / 输入框”
  -> resolve_collection_scope
  -> scope_confirmation
  -> 用户确认范围
  -> 进入 batch patch 生成
```

### 4. 调试与观测链路

```text
Agent 请求
  -> trace 记录 route / status / tool / result / error
  -> GET /agent/traces/:traceId
  -> GET /agent/traces/:traceId/replay
  -> GET /agent/metrics/summary
```

---

## 六、当前最值得关注的模块

### 后端

- `packages/backend/src/modules/page-schema`
  - 页面保存、读取、版本控制
- `packages/backend/src/modules/schema-context`
  - 焦点切片、候选定位、上下文组装
- `packages/backend/src/modules/agent-tools`
  - Patch 工具层与守门工具
- `packages/backend/src/modules/agent`
  - 路由、会话、trace、metrics、replay、confirmation 逻辑
- `packages/backend/src/modules/ai`
  - Provider 接入与模型调用封装
- `packages/backend/src/modules/compiler`
  - Schema 编译导出

### 前端

- `packages/frontend/src/editor/LowcodeEditor.tsx`
  - 页面状态、保存、patch 应用主入口
- `packages/frontend/src/editor/services/pageSchemaApi.ts`
  - 页面快照接口访问
- `packages/frontend/src/editor/services/patchAdapter.ts`
  - 后端 patch → 本地 schema 变更
- `packages/frontend/src/editor/components/ai-assistant/AIAssistant`
  - AI 助手 UI
- `packages/frontend/src/editor/components/ai-assistant/AIAssistant/useAIAssistantChat.ts`
  - Agent 请求、SSE、确认链路、trace 聚合
- `packages/frontend/src/editor/components/ai-assistant/api/ServerAIService.ts`
  - `/agent/edit` / `/agent/edit/stream` 调用层

---

## 七、接下来最合理的工作重点

如果继续沿着路线图推进，最优先的不是再堆更多 Agent 技巧，而是补齐**底层持页能力的最终形态**：

### P0：把页面快照从文件存储切到正式数据库

原因：

- 当前 Agent 已经依赖 `pageId + version`
- 文件存储能做开发验证，但不足以支撑更真实的多人/多页面场景
- trace、replay、metrics 的价值，最终也要建立在更稳定的页面快照基线之上

### P1：补强评测集与长期指标

建议继续推进：

- 固定样本集
- 成功率 / 失败率 / 澄清率统计
- 常见误判归因

### P1：前端增加更可视化的 trace / replay 浏览能力

当前后端接口已经有了，但前端还可以继续做：

- trace 详情查看
- replay 时间线
- 指标面板

---

## 八、当前项目的总体判断

### 亮点

- 已经从“AI 生成整页 Schema”进化到“后端受控 Agent 编辑”
- Patch 链路、工具层、SSE 状态流、确认链路和调试能力都已形成闭环
- 前后端边界较清晰：前端负责体验与本地命令承接，后端负责上下文、工具与编排

### 风险

- 页面快照还不是正式数据库化方案
- 可观测性虽然已有接口，但更适合内部调试，离完整产品化还差一层 UI
- 文档与实现推进较快，容易出现路线图、README、项目综述不同步

### 结论

当前项目已经具备一个**可运行、可验证、可继续扩展的 Agent 编辑内核**。  
从路线图角度看，最值得保持的方向是：

> **继续巩固 page snapshot 基线，逐步把当前已落地的 Agent 能力从“工程验证可用”推进到“产品级稳定可用”。**

---

## 九、常用命令

```bash
# 安装依赖
pnpm install

# 启动前端
pnpm dev

# 启动后端
pnpm dev:backend

# 构建
pnpm build
pnpm build:backend

# 类型检查
pnpm type-check

# 测试（按包执行）
pnpm --filter @lowcode-platform/frontend test
pnpm --filter @lowcode-platform/backend test

# 代码质量
pnpm lint
pnpm format
```

---

## 十、建议一起阅读的文档

- `README.md`：对外说明、快速开始、关键接口与当前能力
- `低代码平台-接入agent路线图.md`：完整路线图与阶段目标
- `低代码平台-Agent-Phase6.4-执行计划.md`：Phase 6.4 的设计与实施记录
