# 低代码平台接入 Agent 路线图

## 文档目的

这份文档不是“理想状态设计稿”，而是基于**当前仓库真实进展**整理出的接入路线图。

它回答三个问题：

1. 当前项目已经做到哪里了
2. 目标中的 Agent 架构应该长什么样
3. 从当前实现演进到目标架构，下一步应该先做什么

---

## 一句话结论

当前项目已经具备：

- 前端低代码编辑器、组件树、属性面板、撤销重做
- 前端 AI 助手 UI（浮动岛、历史记录、模型配置）
- AI 输出的 Schema 校验与 auto-fix
- 后端 AI 网关能力
- 后端编译器能力

当前项目**还没有**真正具备：

- 面向 Agent 的 function calling 工具层
- 基于工具调用的 bounded Agent orchestrator
- “Agent 只返回 patch，不直接返回整页 schema”的闭环

已完成但仍在演进中：

- 后端持有页面 schema snapshot（Phase 1 已完成）
- 基于 `pageId/version` 的页面读取与并发保护（Phase 1 已完成）
- 后端 `schema-context` 模块：页面理解与局部上下文能力（Phase 2 已完成，2026-03-19）

因此，现阶段更准确的描述应该是：

> 项目已经完成了”前端 AI 助手 + Schema 生成/应用”的第一版产品壳子，后端已具备页面快照存储和页面理解/上下文切片能力，但还没有完成”function calling + patch 化编辑”的 Agent 架构。

---

## 当前项目真实状态

### 已完成

#### 1. 前端编辑器主链路已可用

- 编辑器中的页面 schema 目前主要由前端持有和更新
- 已有组件树、属性面板、预览、模板、编译入口
- 已有命令历史体系，可承接撤销/重做

这意味着：**前端编辑体验已经成型**，未来接入 Agent 时，不需要重做编辑器，只需要把 AI 产物从“整页 schema”切到“patch/command”。

#### 2. 前端 AI 助手已经存在

- 已有 AI 浮动岛和聊天 UI
- 已有 AI 历史记录和回滚入口
- 当前 AI 返回结果主要是整份 `schemaSnapshot`，前端解析后直接应用

这意味着：**AI 入口和交互壳子已经有了**，但当前仍然偏“生成整页 schema”，不是受控编辑 Agent。

#### 3. Schema 校验与 auto-fix 已具备基础

- AI 返回的 schema 会经过前端校验
- 已有 schema auto-fix 和安全限制
- 这为后续把 validate / auto-fix 前移到后端提供了基础

#### 4. 后端已有 AI 网关和编译器

- 后端已支持多模型 Provider 管理
- 已有聊天、流式聊天、Schema 生成接口
- 已有编译器模块

这意味着：**后端不是空白项目**，但它现在更像“AI API 网关 + 编译服务”，还不是“Agent 页面编辑服务”。

#### 5. 后端稳定性基线只完成了一部分

- 已有鉴权
- 已有基础限流
- 已有请求日志和 requestId

但以下能力还没有真正建立：

- 页面级版本并发保护
- Agent run 超时控制
- 最大步数 / 最大工具调用数限制
- 页面级 optimistic check
- metrics / trace / replay

---

### 未完成但必须补齐

#### 1. patch 协议还没有成为 AI 主输出

当前 AI 结果更接近“返回整份 schema”，而不是“返回受控 patch”。

这会导致：

- AI 输出过大
- diff 不清晰
- 无法很好地映射到 function calling
- 难以严格限制 AI 修改范围

#### 3. function calling 工具层尚未建立

当前后端没有正式的：

- `getPageSchema`
- `getNodeContext`
- `findNodeCandidates`
- `insertComponent`
- `updateComponentProps`
- `bindEvent`
- `removeComponent`
- `validatePatch`
- `autoFixPatch`

也就还没有真正意义上的“工具驱动 Agent”。

---

## 目标效果

目标不是“让 AI 直接生成一整页 JSON”，而是：

> 用户在前端选中某个组件，或者说“把那个按钮改成提交按钮”，后端 Agent 基于页面快照和 function calling 读页面、定位节点、生成 patch，并把 patch 返回给前端，由前端走现有 command/history 体系应用。

这是比当前实现更适合长期演进的架构。

---

## 为什么后端必须持有页面内容和页面 ID

我认为这是必须的，而且应该尽早建立。

### 原因 1：避免每次传输整页 schema

如果页面越来越大，每次 AI 请求都把整份 JSON 从前端传给后端，会有这些问题：

- 请求体膨胀
- token 成本上升
- 响应延迟增加
- 日志和排查成本升高

### 原因 2：function calling 必须有统一页面状态

如果 Agent 要调用工具，例如：

- 读取页面
- 查找“当前选中的按钮”
- 找到 instruction 指向的“那个组件”
- 基于当前页面生成 patch

那么后端必须有一个权威页面快照，否则工具只能依赖前端临时塞过来的大 JSON，工具层会非常脆弱。

### 原因 3：需要版本和并发保护

只要页面编辑不是单点同步保存，就一定会遇到：

- 前端本地 draft 比后端旧/新
- AI 修改和人工修改并发发生
- 历史回滚后版本不一致

因此后端至少要有：

- `pageId`
- `version`
- `latestSnapshot`

这样才能做 optimistic check。

### 原因 4：方便做“选中组件”与“那个组件”的统一解析

用户的真实操作通常不是只给一段自然语言，而是：

- 前端选中了一个组件
- 用户口头又说“那个组件”
- 或者说“把右边那个表格加个标题”

这类请求需要后端先有页面，再结合：

- `selectedId`
- instruction
- 局部上下文

去做节点定位，而不是让模型直接在一坨 JSON 上自由发挥。

---

## 推荐主链路

下面这条链路最贴合当前项目，也最适合作为下一阶段目标架构。

### A. 页面保存链路

1. 前端编辑器保存页面时，向后端提交完整 schema
2. 后端以 `pageId + version` 保存一份全量 snapshot
3. 后端更新页面最新版本指针
4. 前端保留本地 draft 和撤销重做能力

第一版建议：

- 先用**全量 snapshot 递增版本**
- 不做复杂 diff 存储
- 不做细粒度索引表

这一步是整个 Agent 架构的地基。

### B. AI 编辑请求链路

1. 前端选中组件，拿到 `selectedId`
2. 用户输入自然语言，例如“把这个按钮改成提交并绑定保存事件”
3. 前端向后端发送：
   - `pageId`
   - `version`
   - `selectedId`
   - `instruction`
   - 可选 `draftSchema` 或 `draftPatch`
4. 后端先读取最新页面 snapshot
5. 如果带有未保存草稿，则在内存中叠加 draft，生成本次请求的 resolved schema
6. Agent 通过 function calling 调用工具：
   - 读取页面
   - 获取局部上下文
   - 查找候选节点
   - 生成 patch
   - validate
   - auto-fix
7. 后端返回结构化 patch 与元信息
8. 前端把 patch 映射到现有 command/history 体系
9. 前端应用修改，并保留撤销/重做能力

### C. 用户说“那个组件”时的解析链路

优先级建议如下：

1. 如果前端有 `selectedId`，优先把它作为 focus node
2. 如果没有 `selectedId`，再根据 instruction 做节点候选检索
3. 如果候选不唯一，返回澄清信息或候选解释
4. 第一版不要把歧义完全交给模型猜

---

## 推荐的数据与接口形态

### 页面数据

建议至少有两张表：

#### `pages`

- `id`
- `name`
- `currentVersion`
- `latestSnapshotId`
- `createdAt`
- `updatedAt`

#### `page_schema_snapshots`

- `id`
- `pageId`
- `version`
- `schema`
- `createdAt`
- `updatedAt`

### 推荐后端接口

#### 页面接口

- `PUT /pages/:pageId/schema`
- `GET /pages/:pageId/schema`
- `GET /pages/:pageId/schema?version=xx`

#### Agent 接口

- `POST /agent/edit`
- `POST /agent/edit/stream`

请求体建议：

```json
{
  "pageId": "page_123",
  "version": 7,
  "instruction": "把这个按钮改成提交按钮，并绑定保存事件",
  "selectedId": "button_submit",
  "draftSchema": null
}
```

返回体建议：

```json
{
  "pageId": "page_123",
  "baseVersion": 7,
  "patch": [
    {
      "op": "updateProps",
      "componentId": "button_submit",
      "props": {
        "children": "提交"
      }
    },
    {
      "op": "bindEvent",
      "componentId": "button_submit",
      "event": "onClick",
      "actions": [
        {
          "type": "apiCall",
          "url": "/api/save",
          "method": "POST"
        }
      ]
    }
  ],
  "resolvedSelectedId": "button_submit",
  "warnings": [],
  "traceId": "agent_xxx"
}
```

---

## 当前版本与目标版本的关系

### 当前版本

当前更接近下面这条链路：

1. 前端持有 schema
2. 用户在 AI 浮动岛输入需求
3. 前端把 prompt 和可选 schema 上下文发给后端 AI 接口
4. 后端返回文本或整页 schema
5. 前端解析 schema
6. 前端 validate / auto-fix
7. 前端直接替换或合并 schema

这条链路可以用，但它本质上还是：

> “AI 辅助生成/修改 Schema”

而不是：

> “受控的页面编辑 Agent”

### 目标版本

目标要演进成：

1. 后端持有页面 snapshot
2. 前端只传 `pageId/version/selectedId/instruction`
3. 后端 Agent 通过 function calling 读页面和局部上下文
4. 后端返回 patch
5. 前端把 patch 映射为 command

---

## 分阶段路线图

## 阶段 0：对齐当前实现与过渡架构

### 目标

承认当前前端 AI 助手已存在，并把它从“整页 schema 生成器”平滑过渡到“后端 Agent 编辑入口”。

### 本阶段已完成

- 前端 AI 助手 UI
- 模型管理 UI
- AI 历史记录
- Schema validate / auto-fix
- 编辑器 command/history 基础
- 组件选中态
- 后端 AI 网关

### 本阶段待补

- 统一前后端 AI 接口命名
- 明确当前 AI 返回结构
- 为后续 patch 化留出 DTO 扩展位

### 验收标准

- [ ] 前后端 AI 接口命名统一，不再同时存在多套相近但不一致的编辑接口命名
- [ ] 文档中明确区分“当前整页 schema 模式”和“目标 patch 模式”
- [ ] 当前 AI 请求/响应结构被固定下来，并能在代码中找到唯一入口
- [ ] 为后续 `pageId/version/selectedId` 请求结构预留字段，不需要等 Phase 1 再推倒改一次

### 可独立停靠条件

- 即使后续后端页面快照还没开始做，当前 AI 助手仍可继续工作
- 团队已经对“当前模式是什么、目标模式是什么、下一步接口怎么收敛”达成共识
- 后续 Phase 1 和 Phase 3 的 DTO 设计不会再反复返工

### 最小验证机制

- [ ] 文档验证：当前 AI 请求链路和目标链路各有一张时序说明
- [ ] 契约验证：给出一份当前 AI 请求 DTO 和目标 Agent 请求 DTO 草案
- [ ] 冒烟验证：当前 AI 助手仍能完成一次整页 schema 生成或修改
- [ ] 最小测试：增加 1 个前端调用层测试，确认请求入口唯一且结构稳定
- [ ] 人工验收：从浮动岛发起一次当前 AI 请求并成功收到结果（人工验收：建议手动）

---

## 阶段 1：后端页面快照基础设施

### 目标

让后端成为页面 schema 的权威来源。

### 主要任务

- 建立 `pages` 表
- 建立 `page_schema_snapshots` 表
- 实现 `SchemaSnapshotService`
- 实现页面 schema 保存/读取接口
- 建立 `pageId + version` 机制
- 保存时增加基础校验

### 完成标准

- 后端可以根据 `pageId` 读取最新 schema
- 后端可以根据 `pageId + version` 读取指定快照
- 前端保存页面时，可以把 schema 持久化到后端

### 验收标准

- [ ] `PUT /pages/:pageId/schema` 可成功保存完整 schema，并返回新版本号
- [ ] `GET /pages/:pageId/schema` 可读取最新版本
- [ ] `GET /pages/:pageId/schema?version=xx` 可读取指定版本
- [ ] 同一个 `pageId` 连续保存两次后，版本号正确递增
- [ ] 当 `baseVersion` 过旧时，接口返回明确的版本冲突错误
- [ ] 存储后的 schema 仍能通过基础 validate

### 可独立停靠条件

- 即使还没有 Agent、没有 function calling，系统也已经拥有“页面后端权威存储”
- 前端可以把页面保存到后端，并在刷新后重新读取
- 团队可以把这一阶段单独当成“页面持久化版本化”里程碑上线

### 最小验证机制

- [ ] API 冒烟：保存一个页面
- [ ] API 冒烟：读取最新页面
- [ ] API 冒烟：读取指定版本
- [ ] API 冒烟：制造一次版本冲突
- [ ] 最小自动化测试：`page-schema.service` 单测至少 3 个
- [ ] 最小自动化测试：controller e2e 至少 2 个
- [ ] 观测要求：每次保存返回 `pageId/version/snapshotId`
- [ ] 人工验收：在编辑器里修改一个按钮文案，保存后刷新，内容仍正确（人工验收：Playwright 可做）

---

## 阶段 2：resolved schema 与局部上下文能力（已完成 ✅ 2026-03-19）

### 目标

让后端具备”读懂页面”和”理解当前焦点组件”的能力。

### 本阶段已完成

- 后端 `schema-context` 模块（SchemaResolver / SchemaSlicer / NodeLocator / ContextAssembler）
- 后端组件元数据注册表（48 个组件类型 + 22 个别名，含中文 displayName、textProps、category）
- Agent 编辑请求已集成 FocusContext 和组件类型列表（`buildSystemPrompt` 终于传入 `componentList`）
- 选中组件时 LLM 可获得父节点、祖先链、兄弟、子树上下文
- 未选中时可通过 instruction 关键词匹配返回候选节点列表（支持中文分词）
- 大页面预算裁剪（progressive degradation，maxOutputBytes=8192）
- 41 个单元测试全部通过（7 个测试套件）
- 3 个测试 fixture（登录表单 ~11 组件、列表页 ~19 组件、大页面 200+ 组件）

### 主要任务

- ~~实现 `SchemaResolverService`~~ ✅
- ~~实现 `SchemaSlicerService`~~ ✅
- ~~实现 `NodeLocatorService`~~ ✅
- ~~实现 `ContextAssemblerService`~~ ✅
- ~~支持 `selectedId` 作为优先焦点~~ ✅
- ~~支持 instruction 驱动的候选节点定位~~ ✅

### 验收标准

- [x] 给定 `pageId + selectedId`，后端能稳定返回固定结构的 `FocusContext`
- [x] `FocusContext` 至少包含：当前节点、父节点、祖先链、子节点、兄弟节点
- [x] 不传 `selectedId` 时，后端能返回候选节点列表，而不是让模型直接盲猜
- [x] 对同一份页面 schema，同样输入应返回稳定一致的切片结果
- [x] 大页面下切片结果有大小上限，不会无限膨胀

### 最小验证机制

- [x] 固定样例页验证：登录表单页
- [x] 固定样例页验证：列表页
- [ ] 固定样例页验证：Dashboard 页
- [x] 最小自动化测试：`SchemaSlicerService` 单测
- [x] 最小自动化测试：`NodeLocatorService` 单测
- [x] 最小自动化测试：`ContextAssemblerService` 单测
- [x] 断言：选中按钮能拿到父 `Form`
- [x] 断言：不选中时输入”提交按钮”能返回候选
- [x] 断言：候选结果带 `score/reason`
- [x] 规模验证：大页面上下文输出不超过约定阈值
- [ ] 人工验收：对照样例页检查返回的上下文结构是否符合预期（人工验收：建议手动）

---

## 阶段 3：工具层与 patch 协议

### 目标

让模型只能通过工具编辑页面。

### 主要任务

- 定义 patch DTO
- 实现 `ToolRegistryService`
- 实现 `ToolExecutionService`
- 提供读工具：
  - 获取页面 schema
  - 获取节点上下文
  - 查找节点候选
  - 获取组件元数据
- 提供写工具：
  - 插入组件
  - 更新属性
  - 绑定事件
  - 移除/移动组件
- 提供守门工具：
  - validate patch
  - auto-fix patch
  - preview patch

### 完成标准

- 不依赖 LLM，也能手工构造 patch 并通过验证
- patch 能映射到前端 command 体系

### 验收标准

- [ ] patch DTO 被固定，且覆盖 `insertComponent`
- [ ] patch DTO 被固定，且覆盖 `updateProps`
- [ ] patch DTO 被固定，且覆盖 `bindEvent`
- [ ] patch DTO 被固定，且覆盖 `removeComponent`
- [ ] patch DTO 被固定，且覆盖 `moveComponent`
- [ ] 每个写工具都能在不依赖 LLM 的情况下独立调用成功
- [ ] patch 应用后，schema 仍能通过 validate
- [ ] 非法 patch 会被明确拒绝，并返回统一错误结构
- [ ] 前端可以使用同一份 patch DTO 应用到本地 schema

### 可独立停靠条件

- 即使没有 Agent，这阶段也已经形成“受控编辑 API”
- 团队可以手工构造 patch，通过后端完成局部编辑验证
- 这可以作为 Agent 前的稳定中间态，不会被后续推翻

### 最小验证机制

- [ ] 手工 patch 验证：更新按钮文案
- [ ] 手工 patch 验证：给按钮绑定事件
- [ ] 手工 patch 验证：在容器下插入一个输入框
- [ ] 最小自动化测试：每个写工具至少 1 个单测
- [ ] 最小自动化测试：`validate_patch` 至少 1 个单测
- [ ] 最小自动化测试：`auto_fix_patch` 至少 1 个单测
- [ ] 最小自动化测试：patch -> schema 应用测试至少 1 个
- [ ] 前端联调验证：把后端返回的 patch 应用到编辑器，预览和属性面板一致（人工验收：Playwright 可做）
- [ ] 错误验证：对不存在的 `componentId` 返回明确错误

---

## 阶段 4：bounded Agent 与 function calling

### 目标

建立受限的后端页面编辑 Agent。

### 主要任务

- 新增 `AgentController`
- 新增 `AgentService`
- 新增 `AgentRunner`
- 接入 function calling
- 固定最大步数、最大工具次数、最大上下文规模
- 固定停止条件
- 强制经过 validate / auto-fix
- 增加 traceId 和错误结构

### 完成标准

- 用户可以通过自然语言修改局部页面
- Agent 不直接输出整页 schema
- Agent 只通过工具和 patch 工作

### 验收标准

- [ ] `POST /agent/edit` 能接收 `pageId/version/selectedId/instruction`
- [ ] Agent 输出只允许是 patch，不允许整页 schema 作为主结果
- [ ] Agent 所有写操作都通过工具层完成
- [ ] Agent run 具备最大步数、最大工具次数、超时控制
- [ ] Agent 出错时能返回 `traceId` 和统一错误码
- [ ] 高频场景稳定通过：修改按钮文案
- [ ] 高频场景稳定通过：绑定按钮点击事件

### 可独立停靠条件

- 即使前端还没全面切换，后端也已经有独立可调用的 Agent 编辑接口
- 可以用 Postman/脚本/内部调试页直接调用 Agent 完成局部编辑
- 这阶段单独上线也成立，因为它已经是一个受控 Agent MVP

### 最小验证机制

- [ ] 最小场景集：“把这个按钮改成提交”
- [ ] 最小场景集：“点击后调用 /api/save”
- [ ] 最小场景集：“删除这个输入框”
- [ ] 最小自动化测试：Agent runner 单测
- [ ] 最小自动化测试：至少 1 个 e2e，覆盖请求 -> Agent -> patch 响应
- [ ] 保护性验证：超步数时返回 `AGENT_TIMEOUT` 或策略错误
- [ ] 保护性验证：非法脚本类输出被拦截
- [ ] 人工验收：连续发起 10 次相同请求，结果稳定不漂移（人工验收：可先脚本化，建议手动复核）

---

## 阶段 5：前端最小接入

### 目标

把后端 Agent 接入当前编辑器，而不推倒重来。

### 主要任务

- 前端保存时同步最新 schema 到后端
- AI 请求时传 `pageId/version/selectedId/instruction`
- 有未保存修改时，可选传 `draftSchema` 或 `draftPatch`
- 把后端 patch 映射到 command/history
- 做版本冲突提示与处理

### 完成标准

- 用户选中组件后可以直接发起 AI 修改
- AI 修改结果可撤销 / 可重做
- 页面版本冲突有明确提示

### 验收标准

- [ ] 前端 AI 请求默认发送 `pageId/version/selectedId/instruction`
- [ ] 当有 `selectedId` 时，用户说“这个组件/那个按钮”可以稳定命中当前选中组件
- [ ] 前端能正确应用后端 patch，并进入现有 history
- [ ] 应用 patch 后预览区正确
- [ ] 应用 patch 后属性面板正确
- [ ] 应用 patch 后撤销/重做正确
- [ ] 发生版本冲突时，前端有明确提示，不会静默覆盖
- [ ] 有未保存草稿时，可选择传 `draftSchema`，且结果不会覆盖用户本地草稿

### 可独立停靠条件

- 即使还没有 trace/diff/stream，这阶段也已经是用户可用版本
- 用户能在编辑器里完成“选中组件 -> 发起 AI -> 应用 patch -> 撤销重做”的完整链路
- 这阶段可以作为第一版正式内测版本停靠

### 最小验证机制

- [ ] 前端联调场景：选中按钮改文案（人工验收：Playwright 可做）
- [ ] 前端联调场景：选中按钮绑定事件（人工验收：Playwright 可做）
- [ ] 前端联调场景：未选中时通过自然语言定位单个组件（人工验收：建议手动）
- [ ] 前端联调场景：版本冲突提示（人工验收：Playwright 可做）
- [ ] 最小自动化测试：patch adapter 单测
- [ ] 最小自动化测试：AI 请求层单测
- [ ] 最小自动化测试：history 接入测试
- [ ] 人工验收：改完后立即 undo / redo（人工验收：Playwright 可做）
- [ ] 人工验收：预览和属性面板保持一致（人工验收：Playwright 可做）
- [ ] 最低 UI 要求：有 loading
- [ ] 最低 UI 要求：有错误提示
- [ ] 最低 UI 要求：有版本冲突提示

---

## 阶段 6：体验与可观测性增强

### 目标

让 Agent 从“能用”变成“稳定、可解释、可排查”。

### 主要任务

- 流式阶段展示
- diff 预览
- 工具轨迹展示
- 候选节点解释
- metrics
- trace
- replay
- 评测样本集

### 验收标准

- [ ] 用户可以看到当前处理阶段，而不是纯黑盒等待
- [ ] patch 应用前可预览 diff
- [ ] 至少能查看工具调用轨迹和最终命中节点
- [ ] 关键请求具备 traceId，可回放一次执行路径
- [ ] 建立最小评测集，并能重复跑出结果
- [ ] 能统计请求数
- [ ] 能统计成功率
- [ ] 能统计平均耗时
- [ ] 能统计工具调用次数
- [ ] 能统计版本冲突次数

### 可独立停靠条件

- 即使不再继续做更复杂能力，这阶段也已经形成“可运维、可排查、可解释”的生产可用版本
- 之后新增能力主要是在已有闭环上增强，而不是补地基

### 最小验证机制

- [ ] 可观测性验证：任意一次 Agent 请求都能拿到 traceId
- [ ] 可观测性验证：能根据 traceId 查到工具轨迹
- [ ] diff 验证：至少 2 类 patch 有可视化预览（人工验收：Playwright 可做）
- [ ] 评测验证：固定 10 个场景样本，能重复跑
- [ ] 指标验证：至少输出到日志或简单 dashboard
- [ ] 人工排障验证：通过一次失败请求完成复盘（人工验收：建议手动）

---

## Phase 停靠原则

为了保证每个阶段都能独立停靠，建议统一遵守下面几个规则：

- 每个 Phase 结束时必须至少有一个可演示入口
- 每个 Phase 结束时必须至少有一组自动化测试，不接受只靠口头验证
- 每个 Phase 结束时必须明确“本阶段上线后用户能得到什么”
- 下一阶段只能在上一阶段已形成稳定输入输出契约后再开始
- 不把“后面会做”当成当前阶段可用性的前提

## 最小验证通用模板

后续每个 Phase 评审时，都可以按这张最小模板过一遍：

### 1. 冒烟验证

- [ ] 是否存在一个从入口到结果的最短成功路径

### 2. 自动化验证

- [ ] 是否至少有单测 / e2e 覆盖主路径

### 3. 失败路径验证

- [ ] 是否验证了至少一个典型错误分支

### 4. 演示验证

- [ ] 是否能现场演示，不依赖手动改代码造结果
- [ ] 如果需要人工验收，是否已标注“Playwright 可做”或“建议手动”

### 5. 停靠判断

- [ ] 如果本周停止开发，这个 Phase 是否仍然是一个可交付物
- [ ] 如果答案是否，则说明 Phase 还没切够小

---

## Phase 管理总表

这张表用于项目推进、排期和验收时快速对齐。

| Phase   | 目标                                   | 主要输入                                 | 主要输出                                                   | 最小 Demo                              | 自动化验证                                     | 人工验收                   | 主要阻塞项                           | 建议工期            |
| ------- | -------------------------------------- | ---------------------------------------- | ---------------------------------------------------------- | -------------------------------------- | ---------------------------------------------- | -------------------------- | ------------------------------------ | ------------------- |
| Phase 0 | 对齐当前模式与目标模式                 | 当前前端 AI 助手、现有后端 AI 接口       | 统一接口命名、固定 DTO 草案、清晰文档                      | 从浮动岛发起一次当前 AI 请求并成功返回 | 前端调用层测试                                 | 建议手动                   | 当前 AI 调用入口分散、接口命名不统一 | 0.5-1 周            |
| Phase 1 | 建立后端页面快照基础设施               | 编辑器 schema、后端存储能力              | `pages` / `page_schema_snapshots`、保存/读取接口、版本机制 | 保存页面后刷新仍可读回                 | service 单测 + controller e2e                  | Playwright 可做            | 数据库存储尚未真正接入               | 1-1.5 周            |
| Phase 2 | 建立页面理解与上下文层 ✅ 2026-03-19   | 页面 snapshot、`selectedId`、instruction | `FocusContext`、节点候选、稳定切片结果                     | 给定 `selectedId` 返回局部上下文       | slicer / locator / assembler 单测（41 个通过） | 建议手动                   | ~~页面结构遍历规则、候选评分规则~~   | ~~1-1.5 周~~ 已完成 |
| Phase 3 | 建立工具层与 patch 协议                | page schema、context、patch DTO          | 读工具、写工具、guard 工具、统一 patch                     | 手工构造 patch 并在前端应用成功        | tool 单测 + patch 应用测试                     | Playwright 可做            | patch 语义与前端 command 映射未固定  | 1-1.5 周            |
| Phase 4 | 建立 bounded Agent 与 function calling | page schema、context、tools              | `POST /agent/edit`、AgentRunner、policy、traceId           | 自然语言返回局部 patch                 | runner 单测 + agent e2e                        | 建议手动                   | function calling 策略、稳定性控制    | 1-2 周              |
| Phase 5 | 接入前端编辑器形成用户闭环             | Agent API、patch adapter、history        | 选中组件 AI 修改、版本冲突提示、undo/redo 闭环             | 选中按钮后 AI 改文案并可撤销           | patch adapter / history 测试                   | Playwright 可做            | 前端状态与后端版本同步               | 1-1.5 周            |
| Phase 6 | 增强体验与可观测性                     | Agent 闭环、trace 基础                   | diff、stream、轨迹、metrics、replay、评测集                | 用户能看到阶段、diff 和 trace          | 评测样本回归测试                               | Playwright 可做 + 手动复盘 | 观测数据采集、回放结构设计           | 1-2 周              |

### 建议验收人

| Phase   | 主验收人 | 辅助验收方式                                      |
| ------- | -------- | ------------------------------------------------- |
| Phase 0 | 你       | 手动检查文档和现有链路                            |
| Phase 1 | 你       | API 冒烟 + Playwright 页面保存回读                |
| Phase 2 | 你       | 手动复核上下文结构和候选解释                      |
| Phase 3 | 你       | Playwright 检查 patch 应用后的预览和属性面板      |
| Phase 4 | 你       | 手动复核 Agent 稳定性与错误返回                   |
| Phase 5 | 你       | Playwright 跑主链路，手动复核版本冲突体验         |
| Phase 6 | 你       | Playwright 验 diff/stream，手动做一次失败排障复盘 |

### 推荐停靠点

- 停靠点 A：Phase 1 完成
  - 这时已经拥有“页面后端权威存储”
- 停靠点 B：Phase 3 完成
  - 这时已经拥有“无 Agent 的受控 patch 编辑能力”
- 停靠点 C：Phase 5 完成
  - 这时已经拥有“用户可用的一版 Agent 编辑闭环”
- 停靠点 D：Phase 6 完成
  - 这时已经拥有“可运维、可排查、可解释”的生产候选版本

---

## Playwright 验收执行约定

这一节用于统一后续各 Phase 中“人工验收：Playwright 可做”的执行方式，避免每次临时约定。

### 总原则

- Playwright 用于验证真实用户链路，不用于替代所有单测
- 能用自动化稳定覆盖的 UI 主链路，优先用 Playwright
- 需要主观判断的内容，例如候选节点解释是否“合理”，仍建议手动复核
- Playwright 验收不依赖个人浏览器登录态、扩展、自动填充和本地缓存

### 浏览器配置约定

- 不要求修改日常使用的 Chrome / Edge 配置
- 不要求手动安装浏览器插件
- 不要求修改默认浏览器
- 由 Playwright 自己拉起受控浏览器实例
- 如需自定义请求头、测试 token、mock 环境变量，应在脚本层或启动层配置，不在浏览器里手动点设置

### 环境前置要求

每次执行 Playwright 验收前，至少确认：

- [ ] 前端 dev server 已启动
- [ ] 后端 dev server 已启动
- [ ] 页面访问地址已确认
- [ ] 后端鉴权 token 已准备好
- [ ] 测试页面或测试项目数据已准备好
- [ ] 不依赖个人浏览器已有缓存和登录态

### 用例设计约定

- 每个 Playwright 验收脚本只覆盖一个明确目标
- 一个脚本最多覆盖一条主业务链路和一个失败分支
- 断言必须尽量落在“用户可见结果”上，而不是只断言网络调用发生
- 能看见的结果优先断言：
  - 页面文本
  - 组件可见性
  - 属性面板变化
  - 保存成功提示
  - 版本冲突提示

### 脚本命名约定

建议命名格式：

```text
playwright/
  phase1-save-schema.spec.ts
  phase1-version-conflict.spec.ts
  phase5-agent-edit-selected-button.spec.ts
  phase5-agent-version-conflict.spec.ts
```

### 结果产出约定

每次 Playwright 验收至少产出以下内容之一：

- 控制台通过记录
- 截图
- 失败时的 trace / screenshot

建议保留：

- 失败截图
- 关键步骤截图
- 失败时对应的请求体/响应体摘要

### 失败处理约定

如果 Playwright 用例失败，优先按下面顺序排查：

1. 环境是否正确启动
2. 测试数据是否存在
3. 鉴权 token 是否正确
4. 页面是否有异步加载延迟
5. 断言是否写得过于依赖 DOM 细节

### 适合 Playwright 的验收项

- 页面保存后刷新仍可回读
- 选中组件后发起 AI 修改
- patch 应用后预览区正确
- patch 应用后属性面板正确
- undo / redo 行为正确
- 版本冲突提示出现
- diff/stream/trace 可见性验证

### 不建议只靠 Playwright 的验收项

- Node candidate 的“语义合理性”
- Agent 结果稳定性是否足够好
- trace 信息是否便于排障
- 失败时提示是否“足够清晰”

这些更适合：

- Playwright 跑主链路
- 你再手动复核一次关键结果

---

## 近期最值得做的 3 件事

如果只考虑当前仓库，优先级建议如下：

### 第一优先级

定义 patch 协议与工具层（Phase 3）：

- 定义 `EditorPatchOperationDto`（insertComponent / updateProps / bindEvent / removeComponent / moveComponent）
- 实现读工具：`get_page_schema`、`get_focus_context`、`find_node_candidates`、`get_component_meta`
- 实现写工具：`update_component_props`、`insert_component`、`bind_event`、`remove_component`、`move_component`
- 实现守门工具：`validate_patch`、`auto_fix_patch`
- 确认 patch 如何映射到前端 command/history

这一步会决定后面 Agent 的输出边界。

### 第二优先级

实现 bounded Agent 与 function calling（Phase 4）：

- 重构 `AgentService` 为基于 function calling 的 `AgentRunner`
- Agent 只通过工具和 patch 工作，不直接输出整页 schema
- 加最大步数、工具调用次数、超时控制
- 返回 `traceId` 和统一错误码

### 第三优先级

前端最小接入（Phase 5）：

- 前端保存时同步 schema 到后端
- AI 请求改为调用 `/agent/edit`，传 `pageId/version/selectedId/instruction`
- 把后端 patch 映射到 command/history
- 版本冲突提示

也就是说：

> Phase 1（页面快照）和 Phase 2（页面理解）已完成，下一步把”patch 输出 + function calling + 前端可应用”这条闭环打通。

---

## 必须坚持的技术约束

- 后端必须持有页面 schema snapshot
- 所有 AI 编辑请求都必须带 `pageId`
- 所有 AI 编辑请求都应该带 `version`
- 有选中组件时优先传 `selectedId`
- Agent 默认返回 patch，不直接返回整页最终 schema
- 所有 AI 结果必须经过 validate 和 auto-fix
- Agent 步数、工具调用次数、上下文规模必须受限
- 第一版不开放自由 `customScript` 生成
- 第一版优先支持局部修改，不追求一次生成整页复杂应用

---

## 当前建议的最终表述

如果要用一句话描述当前项目和接下来的方向，建议写成：

> 当前项目已经完成前端低代码编辑器、AI 助手 UI、Schema 校验与后端 AI 网关能力；下一阶段将把现有“前端整页 Schema 生成/应用”模式，演进为“后端持有页面快照、基于选中组件和页面上下文进行 function calling、返回 patch 并接入前端 command/history”的受控页面编辑 Agent 架构。

---

## 可开发执行版

这一节把路线图进一步落到“可以开始拆任务开发”的程度。

目标是先打通最小闭环：

> 前端传 `pageId/version/selectedId/instruction` -> 后端读取页面 -> 生成 patch -> 前端应用 patch。

---

## 一、建议的后端模块拆分

建议在当前 `packages/backend/src/modules` 下，按下面方式新增模块。

### 1. `page-schema` 模块

职责：

- 页面基础信息管理
- schema snapshot 存取
- 根据 `pageId/version` 读取 schema

建议包含：

- `page-schema.module.ts`
- `page-schema.controller.ts`
- `page-schema.service.ts`
- `schema-snapshot.service.ts`
- `dto/save-page-schema.dto.ts`
- `dto/get-page-schema.dto.ts`

### 2. `schema-context` 模块

职责：

- resolved schema 解析
- 局部上下文切片
- 节点定位
- 关联节点组装

建议包含：

- `schema-context.module.ts`
- `schema-resolver.service.ts`
- `schema-slicer.service.ts`
- `node-locator.service.ts`
- `context-assembler.service.ts`
- `dto/focus-context.dto.ts`

### 3. `agent-tools` 模块

职责：

- 工具注册
- 工具参数校验
- 工具统一执行和错误包装
- patch validate / auto-fix

建议包含：

- `agent-tools.module.ts`
- `tool-registry.service.ts`
- `tool-execution.service.ts`
- `tools/read/get-page-schema.tool.ts`
- `tools/read/get-node-context.tool.ts`
- `tools/read/find-node-candidates.tool.ts`
- `tools/write/update-component-props.tool.ts`
- `tools/write/insert-component.tool.ts`
- `tools/write/bind-event.tool.ts`
- `tools/write/remove-component.tool.ts`
- `tools/guard/validate-patch.tool.ts`
- `tools/guard/auto-fix-patch.tool.ts`

### 4. `agent` 模块

职责：

- Agent API
- function calling 编排
- bounded run 控制
- traceId / warnings / 统一响应结构

建议包含：

- `agent.module.ts`
- `agent.controller.ts`
- `agent.service.ts`
- `agent-runner.service.ts`
- `agent-policy.service.ts`
- `dto/agent-edit-request.dto.ts`
- `dto/agent-edit-response.dto.ts`
- `dto/patch.dto.ts`

---

## 二、建议的数据表结构

第一版建议只做最小模型，不引入复杂 diff 表。

### 1. `pages`

用途：

- 记录页面元信息
- 保存当前版本号和最新快照指针

建议字段：

```sql
CREATE TABLE pages (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  current_version INT NOT NULL DEFAULT 1,
  latest_snapshot_id VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 2. `page_schema_snapshots`

用途：

- 按版本保存完整 schema

建议字段：

```sql
CREATE TABLE page_schema_snapshots (
  id VARCHAR(64) PRIMARY KEY,
  page_id VARCHAR(64) NOT NULL,
  version INT NOT NULL,
  schema_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(page_id, version)
);
```

### 第一版暂时不做

- patch 存储表
- 细粒度节点索引表
- 向量检索表
- 审计回放表

这些都可以放到后续阶段。

补充一个当前已知但不阻塞路线图推进的维护项：

- 前端 `PreviewPane.tsx` 中为支持 JSON 视图的组件定位 / reveal / 高亮，已经累积了一批导航逻辑；等路线图主链路演进完成后，再评估是否抽成独立的 `jsonNavigation.ts` 或同类 utils，避免在当前阶段过早为纯维护性重构打断 Phase 推进。

---

## 三、最小 API 设计

## 1. 页面 schema API

### `PUT /pages/:pageId/schema`

用途：

- 保存当前页面完整 schema
- 自动递增版本

请求体建议：

```json
{
  "schema": {
    "rootId": "page_root",
    "components": {}
  },
  "baseVersion": 7
}
```

响应体建议：

```json
{
  "pageId": "page_123",
  "version": 8,
  "snapshotId": "snapshot_8",
  "updatedAt": "2026-03-18T20:00:00.000Z"
}
```

规则建议：

- 如果 `baseVersion` 不等于后端当前版本，则返回版本冲突
- 保存成功后返回新版本号

### `GET /pages/:pageId/schema`

用途：

- 获取最新 schema

### `GET /pages/:pageId/schema?version=7`

用途：

- 获取指定版本 schema

---

## 2. Agent 编辑 API

### `POST /agent/edit`

这是整个链路的核心接口。

请求体建议：

```json
{
  "pageId": "page_123",
  "version": 7,
  "instruction": "把这个按钮改成提交按钮，并绑定保存事件",
  "selectedId": "button_submit",
  "draftSchema": null,
  "stream": false
}
```

字段说明：

- `pageId`: 必填，后端据此读取页面
- `version`: 必填，作为 optimistic check 基线
- `instruction`: 必填，用户自然语言指令
- `selectedId`: 可选，当前前端选中组件
- `draftSchema`: 可选，前端未保存草稿
- `stream`: 第一版可以先忽略，只保留字段

响应体建议：

```json
{
  "pageId": "page_123",
  "baseVersion": 7,
  "resolvedVersion": 7,
  "resolvedSelectedId": "button_submit",
  "patch": [
    {
      "op": "updateProps",
      "componentId": "button_submit",
      "props": {
        "children": "提交"
      }
    },
    {
      "op": "bindEvent",
      "componentId": "button_submit",
      "event": "onClick",
      "actions": [
        {
          "type": "apiCall",
          "url": "/api/save",
          "method": "POST"
        }
      ]
    }
  ],
  "warnings": [],
  "traceId": "agent_abc123"
}
```

错误结构建议：

```json
{
  "code": "PAGE_VERSION_CONFLICT",
  "message": "Page version mismatch",
  "pageId": "page_123",
  "expectedVersion": 8,
  "actualVersion": 7,
  "traceId": "agent_abc123"
}
```

错误码建议至少包括：

- `PAGE_NOT_FOUND`
- `PAGE_VERSION_CONFLICT`
- `SCHEMA_INVALID`
- `NODE_NOT_FOUND`
- `NODE_AMBIGUOUS`
- `PATCH_INVALID`
- `AGENT_TIMEOUT`
- `AGENT_POLICY_BLOCKED`

---

## 四、patch DTO 建议

第一版不要追求通用 JSON Patch，建议直接贴近当前编辑器 command 语义。

### 推荐 patch 结构

```ts
type EditorPatchOperation =
  | {
      op: 'insertComponent';
      parentId: string;
      index?: number;
      component: Record<string, unknown>;
    }
  | {
      op: 'updateProps';
      componentId: string;
      props: Record<string, unknown>;
    }
  | {
      op: 'bindEvent';
      componentId: string;
      event: string;
      actions: Array<Record<string, unknown>>;
    }
  | {
      op: 'removeComponent';
      componentId: string;
    }
  | {
      op: 'moveComponent';
      componentId: string;
      newParentId: string;
      newIndex: number;
    };
```

### 为什么不建议第一版直接上 JSON Patch

- 当前前端 command 语义是组件编辑语义，不是通用 JSON 文档语义
- 组件插入、事件绑定、移动组件，用领域 patch 更直观
- 出错时更容易定位
- 更容易做白名单校验

### patch validate 建议

至少校验以下内容：

- `componentId` / `parentId` 是否存在
- 写操作目标是否在允许范围内
- 插入组件类型是否注册
- props 是否满足白名单
- event actions 是否满足安全限制
- patch 应用后 schema 是否仍能通过 validate

---

## 五、Agent 内部执行流程建议

第一版建议不要做复杂多轮智能体，先做一个非常保守的 bounded flow。

### 最小执行流程

1. 校验请求 DTO
2. 根据 `pageId` 读取页面最新 snapshot
3. 校验 `version`
4. 如果有 `draftSchema`，构造 resolved schema
5. 根据 `selectedId` 和 `instruction` 构造 focus context
6. 调用 function calling / tool calling
7. 得到 patch
8. validate patch
9. auto-fix patch
10. 返回 patch、warnings、traceId

### function calling 第一批工具建议

读工具：

- `get_page_schema`
- `get_focus_context`
- `find_node_candidates`
- `get_component_meta`

写工具：

- `update_component_props`
- `insert_component`
- `bind_event`
- `remove_component`
- `move_component`

守门工具：

- `validate_patch`
- `auto_fix_patch`

### policy 建议

- 最大步数 `<= 6`
- 最大工具调用数 `<= 8`
- 超时 `<= 15s`
- 默认禁止生成 `customScript`
- 默认禁止跨页面编辑
- 默认禁止无目标的大范围整页重写

---

## 六、前端接入改动点

下面按当前仓库结构给出建议改动点。

## 1. 编辑器主状态

文件：

- `packages/frontend/src/editor/LowcodeEditor.tsx`

建议新增：

- `pageId`
- `pageVersion`
- 保存页面到后端的逻辑
- AI 请求时透传 `selectedId`
- patch 应用入口

### 2. AI 上下文

文件：

- `packages/frontend/src/editor/hooks/useAIContext.ts`

当前已有：

- `selectedId`
- `selectedComponentIds`
- 基础格式化上下文

建议新增：

- `pageId`
- `pageVersion`
- 可选 `draftSchema`

这样 AI 请求时不再只传 prompt。

## 3. AI 调用层

文件：

- `packages/frontend/src/editor/components/ai-assistant/api/ServerAIService.ts`
- `packages/frontend/src/editor/components/ai-assistant/AIAssistant/useAIAssistantChat.ts`

建议改造：

- 从当前“请求文本生成接口”改成“请求 Agent 编辑接口”
- 不再默认期待返回整份 schema
- 期待结构化 patch

### 4. command / history 承接层

文件：

- `packages/frontend/src/editor/commands/schemaCommands.ts`
- `packages/frontend/src/editor/store/history.ts`

建议新增：

- `applyPatchToSchema`
- `createPatchCommand`

第一版甚至可以先把 patch 转成现有 `UpdateSchemaCommand`，等跑通后再细化成更精确的 command。

### 5. 版本冲突提示

建议新增位置：

- `packages/frontend/src/editor/components/ai-assistant/AIAssistant/AIAssistant.tsx`
- 或 `LowcodeEditor.tsx`

需要处理：

- 页面保存冲突
- AI 编辑基线版本冲突
- 提示用户刷新、覆盖或重试

---

## 七、后端接入改动点

按当前仓库，建议优先修改这些位置。

### 第一批新增文件

建议新增：

- `packages/backend/src/modules/page-schema/*`
- `packages/backend/src/modules/schema-context/*`
- `packages/backend/src/modules/agent-tools/*`
- `packages/backend/src/modules/agent/*`

### 现有文件需要修改

#### `packages/backend/src/app.module.ts`

需要新增导入：

- `PageSchemaModule`
- `SchemaContextModule`
- `AgentToolsModule`
- `AgentModule`

#### `packages/backend/src/config/database.config.ts`

当前只是预留配置，后续需要真正接数据库。

第一版即使暂时不用完整 ORM，也至少要把：

- 页面表
- snapshot 表

落到真实存储中，而不是继续只停留在配置层。

#### `packages/backend/src/modules/ai/*`

这部分建议保持为“通用 AI Provider 层”，不要把页面 Agent 逻辑继续堆在这里。

建议做法：

- `ai` 模块继续负责模型调用能力
- 新 `agent` 模块负责页面编辑 orchestration

这样职责更清晰。

---

## 八、第一阶段开发顺序建议

如果要开始排期，我建议按下面顺序来，不要反过来。

### 第 1 步

先做页面 schema 存储闭环：

- 建表
- `PUT /pages/:pageId/schema`
- `GET /pages/:pageId/schema`

这一步完成后，后端才真正“持页”。

### 第 2 步

定义 patch DTO 和前端 patch 应用器。

这一步完成后，AI 才能从“整页替换”切到“局部编辑”。

### 第 3 步

做最小版 `POST /agent/edit`：

- 先不追求完整 Agent
- 先支持 `selectedId + instruction -> 单次 patch 返回`

### 第 4 步

再接 function calling 和局部上下文工具。

### 第 5 步

最后再补 stream、trace、diff、评测、回放。

---

## 九、最小可交付版本定义

如果只定义一个近期可交付版本，我建议这样定：

### v0.1

目标：

- 后端可保存和读取页面 schema snapshot
- 前端可持有 `pageId/version`
- Agent 接口可接收 `pageId/version/selectedId/instruction`
- 后端返回结构化 patch
- 前端可把 patch 应用到编辑器并进入撤销重做

这个版本做完，项目就会从：

> “AI 生成整页 schema”

正式进入：

> “基于页面快照和选中组件的受控页面编辑”

这会是整个 Agent 架构真正落地的起点。

---

## 十、第一批骨架文件清单

下面这批文件的目标不是一次做完所有逻辑，而是先把工程骨架和主接口立住。

## 后端建议新增

### `packages/backend/src/modules/page-schema/`

```text
page-schema/
  page-schema.module.ts
  page-schema.controller.ts
  page-schema.service.ts
  schema-snapshot.service.ts
  repositories/
    page-schema.repository.ts
  dto/
    save-page-schema.dto.ts
    get-page-schema.dto.ts
  types/
    page-record.ts
    page-schema-snapshot.ts
```

### `packages/backend/src/modules/schema-context/`

```text
schema-context/
  schema-context.module.ts
  schema-resolver.service.ts
  schema-slicer.service.ts
  node-locator.service.ts
  context-assembler.service.ts
  dto/
    focus-context.dto.ts
    node-candidate.dto.ts
```

### `packages/backend/src/modules/agent-tools/`

```text
agent-tools/
  agent-tools.module.ts
  tool-registry.service.ts
  tool-execution.service.ts
  types/
    tool-definition.ts
    tool-result.ts
  tools/
    read/
      get-page-schema.tool.ts
      get-focus-context.tool.ts
      find-node-candidates.tool.ts
      get-component-meta.tool.ts
    write/
      update-component-props.tool.ts
      insert-component.tool.ts
      bind-event.tool.ts
      remove-component.tool.ts
      move-component.tool.ts
    guard/
      validate-patch.tool.ts
      auto-fix-patch.tool.ts
```

### `packages/backend/src/modules/agent/`

```text
agent/
  agent.module.ts
  agent.controller.ts
  agent.service.ts
  agent-runner.service.ts
  agent-policy.service.ts
  prompts/
    page-edit.system-prompt.ts
  dto/
    agent-edit-request.dto.ts
    agent-edit-response.dto.ts
    patch.dto.ts
    patch-operation.dto.ts
  types/
    agent-run-context.ts
    agent-run-result.ts
```

## 前端建议新增或补充

### `packages/frontend/src/editor/services/`

```text
services/
  pageSchemaApi.ts
  agentApi.ts
  patchAdapter.ts
```

### `packages/frontend/src/editor/types/`

```text
types/
  agent.ts
  patch.ts
```

### 当前文件建议重点修改

- `packages/frontend/src/editor/LowcodeEditor.tsx`
- `packages/frontend/src/editor/hooks/useAIContext.ts`
- `packages/frontend/src/editor/components/ai-assistant/AIAssistant/useAIAssistantChat.ts`
- `packages/frontend/src/editor/components/ai-assistant/api/ServerAIService.ts`
- `packages/frontend/src/editor/commands/schemaCommands.ts`

---

## 十一、核心 DTO 与类型草案

这一节给的是第一版建议草案，目标是先让前后端能快速对齐。

## 1. 后端页面 DTO

### `save-page-schema.dto.ts`

```ts
import { IsInt, IsNotEmpty, IsObject, IsOptional, Min } from 'class-validator';

export class SavePageSchemaDto {
  @IsObject()
  schema!: Record<string, unknown>;

  @IsInt()
  @Min(1)
  @IsOptional()
  baseVersion?: number;
}
```

### `get-page-schema.dto.ts`

```ts
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class GetPageSchemaDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  version?: number;
}
```

## 2. Agent 编辑 DTO

### `agent-edit-request.dto.ts`

```ts
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class AgentEditRequestDto {
  @IsString()
  pageId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @IsString()
  instruction!: string;

  @IsString()
  @IsOptional()
  selectedId?: string;

  @IsObject()
  @IsOptional()
  draftSchema?: Record<string, unknown>;

  @IsBoolean()
  @IsOptional()
  stream?: boolean;
}
```

### `agent-edit-response.dto.ts`

```ts
export interface AgentEditResponseDto {
  pageId: string;
  baseVersion: number;
  resolvedVersion: number;
  resolvedSelectedId?: string;
  patch: EditorPatchOperationDto[];
  warnings: string[];
  traceId: string;
}
```

## 3. patch 类型草案

### `patch-operation.dto.ts`

```ts
export type EditorPatchOperationDto =
  | {
      op: 'insertComponent';
      parentId: string;
      index?: number;
      component: Record<string, unknown>;
    }
  | {
      op: 'updateProps';
      componentId: string;
      props: Record<string, unknown>;
    }
  | {
      op: 'bindEvent';
      componentId: string;
      event: string;
      actions: Array<Record<string, unknown>>;
    }
  | {
      op: 'removeComponent';
      componentId: string;
    }
  | {
      op: 'moveComponent';
      componentId: string;
      newParentId: string;
      newIndex: number;
    };
```

### 前端对应类型

建议在：

- `packages/frontend/src/editor/types/patch.ts`

先保持和后端完全一致，避免第一阶段出现重复转换和语义漂移。

## 4. Focus Context 草案

### `focus-context.dto.ts`

```ts
export interface NodeCandidateDto {
  id: string;
  type: string;
  score: number;
  reason: string;
}

export interface FocusContextDto {
  pageId: string;
  version: number;
  instruction: string;
  selectedId?: string;
  resolvedNodeId?: string;
  node?: Record<string, unknown>;
  parent?: Record<string, unknown>;
  ancestors: Array<Record<string, unknown>>;
  siblings: Array<Record<string, unknown>>;
  children: Array<Record<string, unknown>>;
  relatedNodes: Array<Record<string, unknown>>;
  candidates?: NodeCandidateDto[];
}
```

---

## 十二、接口与服务骨架建议

下面给的是“先搭起来再填逻辑”的写法。

## 1. `page-schema.controller.ts`

```ts
@Controller('pages')
@UseGuards(AuthGuard)
export class PageSchemaController {
  constructor(private readonly pageSchemaService: PageSchemaService) {}

  @Put(':pageId/schema')
  async saveSchema(@Param('pageId') pageId: string, @Body() dto: SavePageSchemaDto) {
    return this.pageSchemaService.saveSchema(pageId, dto);
  }

  @Get(':pageId/schema')
  async getSchema(@Param('pageId') pageId: string, @Query() query: GetPageSchemaDto) {
    return this.pageSchemaService.getSchema(pageId, query.version);
  }
}
```

## 2. `page-schema.service.ts`

```ts
@Injectable()
export class PageSchemaService {
  constructor(private readonly snapshotService: SchemaSnapshotService) {}

  async saveSchema(pageId: string, dto: SavePageSchemaDto) {
    // 1. 校验 schema
    // 2. 校验 baseVersion
    // 3. 生成 nextVersion
    // 4. 保存 snapshot
    // 5. 更新 pages.currentVersion / latestSnapshotId
    // 6. 返回 pageId/version/snapshotId
  }

  async getSchema(pageId: string, version?: number) {
    // version 有值则读指定版本，否则读最新版本
  }
}
```

## 3. `agent.controller.ts`

```ts
@Controller('agent')
@UseGuards(AuthGuard)
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post('edit')
  async edit(@Body() dto: AgentEditRequestDto) {
    return this.agentService.edit(dto);
  }
}
```

## 4. `agent.service.ts`

```ts
@Injectable()
export class AgentService {
  constructor(private readonly runner: AgentRunnerService) {}

  async edit(dto: AgentEditRequestDto): Promise<AgentEditResponseDto> {
    return this.runner.runEdit(dto);
  }
}
```

## 5. `agent-runner.service.ts`

```ts
@Injectable()
export class AgentRunnerService {
  async runEdit(dto: AgentEditRequestDto): Promise<AgentEditResponseDto> {
    // 1. 读取 page snapshot
    // 2. 校验 version
    // 3. 构造 resolved schema
    // 4. 生成 focus context
    // 5. 调用 function calling
    // 6. validate / auto-fix patch
    // 7. 返回 patch + traceId
  }
}
```

## 6. 前端 `agentApi.ts`

```ts
export interface AgentEditRequest {
  pageId: string;
  version: number;
  instruction: string;
  selectedId?: string;
  draftSchema?: Record<string, unknown>;
}

export interface AgentEditResponse {
  pageId: string;
  baseVersion: number;
  resolvedVersion: number;
  resolvedSelectedId?: string;
  patch: EditorPatchOperation[];
  warnings: string[];
  traceId: string;
}

export async function editPageByAgent(payload: AgentEditRequest): Promise<AgentEditResponse> {
  return fetchApp.post('/api/v1/agent/edit', payload);
}
```

## 7. 前端 `patchAdapter.ts`

```ts
export function applyPatchToSchema(schema: A2UISchema, patch: EditorPatchOperation[]): A2UISchema {
  let nextSchema = schema;

  for (const op of patch) {
    // 根据 op 类型映射到本地 schema 变更
  }

  return nextSchema;
}
```

---

## 十三、实施 checklist

这一节可以直接拆成任务卡。

## 后端 checklist

### P1. 页面存储闭环

- 新建 `page-schema` 模块
- 建立 `pages` 表
- 建立 `page_schema_snapshots` 表
- 实现 `PUT /pages/:pageId/schema`
- 实现 `GET /pages/:pageId/schema`
- 实现 `GET /pages/:pageId/schema?version=xx`
- 保存前接入 schema validate
- 增加版本冲突错误返回

### P2. 上下文层 ✅ 2026-03-19

- ~~实现 `SchemaResolverService`~~ ✅
- ~~实现 `SchemaSlicerService`~~ ✅
- ~~实现 `NodeLocatorService`~~ ✅
- ~~实现 `ContextAssemblerService`~~ ✅
- ~~支持 `selectedId` 优先解析~~ ✅
- ~~支持 instruction 候选检索~~ ✅
- 后端组件元数据注册表（48 类型 + 22 别名） ✅
- Agent 编辑请求集成 FocusContext 和组件类型列表 ✅
- 41 个单元测试通过 ✅

### P3. 工具层

- 定义 `EditorPatchOperationDto`
- 实现读工具 4 个
- 实现写工具 5 个
- 实现 `validate_patch`
- 实现 `auto_fix_patch`
- 统一 tool error DTO

### P4. Agent 层

- 新建 `agent` 模块
- 实现 `POST /agent/edit`
- 接入 function calling
- 加最大步数限制
- 加工具数限制
- 加超时
- 返回 `traceId`

## 前端 checklist

### F1. 页面主状态

- 在编辑器状态中引入 `pageId`
- 在编辑器状态中引入 `pageVersion`
- 增加保存页面到后端逻辑

### F2. AI 请求重构

- AI 请求改为调用 `/agent/edit`
- 请求体增加 `pageId`
- 请求体增加 `version`
- 请求体增加 `selectedId`
- 可选增加 `draftSchema`

### F3. patch 应用器

- 新增 `patchAdapter.ts`
- 实现 `applyPatchToSchema`
- 把 patch 应用结果接入现有 history
- 第一版先兼容 `UpdateSchemaCommand`

### F4. UI 反馈

- 处理页面版本冲突提示
- 处理节点歧义提示
- 处理 patch 校验失败提示
- 可选展示 warnings

---

## 十四、推荐开发节奏

如果按两周到三周一个小周期推进，建议这样拆：

### Sprint A

目标：

- 页面 schema 后端存储闭环
- 前端拿到 `pageId/version`

交付：

- `PUT/GET /pages/:pageId/schema`
- 前端页面保存可落后端

### Sprint B

目标：

- patch DTO
- 前端 patch 应用器
- 最小 `POST /agent/edit`

交付：

- 手工 mock patch 也能在前端应用并进入 history

### Sprint C

目标：

- function calling
- focus context
- 节点定位

交付：

- 支持“修改当前选中组件”这一类局部编辑

### Sprint D

目标：

- trace
- diff
- stream
- 候选解释

交付：

- 第一版可观测性和可解释性能力

---

## 十五、首批验收场景

建议把下面这些场景作为第一批验收样例。

### 场景 1：选中按钮改文案

用户操作：

- 前端选中一个按钮
- 输入“把这个按钮改成提交”

预期：

- 请求携带 `selectedId`
- 后端返回 `updateProps`
- 前端成功应用 patch

### 场景 2：选中按钮绑定点击事件

用户操作：

- 前端选中按钮
- 输入“点击后调用 /api/save”

预期：

- 后端返回 `bindEvent`
- action 经过校验
- 前端应用后属性面板与预览一致

### 场景 3：未选中组件，通过语言定位

用户操作：

- 输入“把页面右上角那个表格加个标题”

预期：

- 后端先返回候选节点或直接命中单一节点
- 如果歧义，给出候选解释

### 场景 4：版本冲突

用户操作：

- A 标签页保存后版本变成 8
- B 标签页仍基于版本 7 发起 Agent 请求

预期：

- 后端返回 `PAGE_VERSION_CONFLICT`
- 前端提示用户刷新或重试

### 场景 5：未保存草稿参与 Agent

用户操作：

- 用户本地改了属性但还没保存
- 直接发起 AI 修改

预期：

- 前端可选传 `draftSchema`
- 后端基于 resolved schema 工作
- patch 结果不会无意覆盖本地草稿
