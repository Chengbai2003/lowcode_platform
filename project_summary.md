# A2UI 低代码平台项目综述

> **最后更新时间**：2026-03-26  
> **仓库形态**：2 包 Monorepo（`packages/frontend` + `packages/backend`）  
> **当前实现状态**：Agent Phase 6.4 已完成，页面快照数据库化仍待推进

## 一、当前判断

这个项目已经不只是“AI 生整页 JSON”的功能点，而是在做一个 **项目专属 agent 产品**：

- 前端承接编辑器体验、确认、预览、应用 patch、撤销
- 后端承接页面快照、上下文切片、工具调用、bounded agent 编排
- 当前真正的主干能力是“冷启动生成 + 受控 patch 微调”

更贴切的理解方式是：

- `Harness Core`：路由、policy、session memory、trace、replay、metrics、SSE
- `Domain Pack`：低代码组件元数据、页面编辑规则、schema-context、tool registry、prompt 片段、风险规则、评测样本
- `Product UX`：聊天、确认、预览、应用 patch、撤销、错误展示

其中 `Harness Core` 和 `Product UX` 已经比较清晰，`Domain Pack` 还没有被完全提炼成一等资产，仍分散在多个模块里。

## 二、当前已落地的部分

### 前端

- 低代码编辑器主链路已成型
- `pageId / pageVersion` 已接到页面快照接口
- AI 助手已支持 `auto / answer / schema / patch`
- SSE、clarification、intent confirmation、scope confirmation、patch 预览与应用已接入

### 后端

- 页面快照接口与版本冲突保护已具备
- `schema-context` 和 `agent-tools` 已落地
- bounded agent 已支持 `answer / schema / patch` 路由
- 会话短记忆、只读缓存、patch 幂等复用已具备
- trace / replay / metrics 已形成基本调试链路

## 三、Schema vs. Patch 分工

当前比较健康的理解方式是：

- `schema`：冷启动能力，用于文本起草、原型转译、首次建页、大骨架重建
- `patch`：主交互引擎，用于已有页面上的局部、安全、可预览修改

所以 `schema` 不是应该被删除的历史包袱，而是 bootstrap 能力；真正不适合的是把它继续当成和 `patch` 同等级的日常主路线长期并跑。

## 四、与路线图的对照

| 阶段                        | 当前状态                                                   |
| --------------------------- | ---------------------------------------------------------- |
| Phase 1 页面快照基础设施    | 部分完成：接口、版本机制、文件持久化已落地；数据库化未完成 |
| Phase 2 局部上下文能力      | 已完成                                                     |
| Phase 3 工具层与 patch 协议 | 已完成                                                     |
| Phase 4 bounded Agent       | 已完成                                                     |
| Phase 5 前端 patch 主链路   | 已完成                                                     |
| Phase 6.1 ~ 6.4             | 已完成当前一轮落地                                         |

当前最关键的现实判断是：

> Agent 主链路已经跑起来了，但页面快照底层存储仍停留在过渡方案。

## 五、主要风险

- 页面快照仍是 file-backed store，不足以支撑更真实的多人/多页面场景
- `Domain Pack` 还没有抽成可替换资产，未来会限制多业务包、多范式扩展
- `agent-runner.service.ts` 与 `useAIAssistantChat.ts` 已经开始长成神对象

## 六、下一步优先级

### P0：页面快照数据库化

先把 `pageId + version` 对应的底层持久化补齐，建立稳定基线。

### P1：Domain Pack 提炼

把散落在 prompt、policy、工具定义、组件元数据里的项目知识逐步抽成领域包。

### P1：评测与观测闭环

继续补强固定样本、指标沉淀、trace/replay 的产品化查看能力。

## 七、总体结论

当前项目已经具备一个 **可运行、可验证、可继续扩展的页面编辑 Agent 内核**。  
后续最值得坚持的方向不是继续堆更多 prompt 技巧，而是补齐页面快照基线，并把领域知识从实现细节里抽离出来。
