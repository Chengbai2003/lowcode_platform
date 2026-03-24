# Phase 6.4 执行计划：可观测性、回放与评测闭环 + Intent Normalization

## 摘要

Phase 6.4 在路线图中的定位，不是继续补“能不能跑”的链路，而是把 Agent 从“能排障”推进到“能持续优化”。结合当前实现，本阶段应同时收口两条主线：

1. `P0 可观测性与评测基线`
   包含完整 trace、工具轨迹展示、metrics、replay、最小评测样本集，以及一次失败请求可复盘的排障闭环。
2. `P0/P1 集合语义归一化`
   包含 alias registry、静默 intent normalization、多义 `intent_confirmation`、容器内候选过滤、与 `scope_confirmation` 的双阶段衔接。

基于当前实现，集合目标批量 patch 的 `scope_confirmation` 两阶段链路已经落地；Phase 6.4 不应重做现有范围确认、patch preview、patch 应用与 undo/history 机制，而应在现有 `agent / schema-context / ai-assistant` 链路前补上一层集合编辑语义归一化，并在链路外围补齐“可观测、可回放、可评测”的工程闭环。

交付物以仓库根目录独立文档为准，默认文件名：`低代码平台-Agent-Phase6.4-执行计划.md`。

## 阶段定位与目标

- 路线图对 Phase 6.4 的主目标是：把 Agent 从“能排障”推进到“能持续优化”。
- 本阶段近期优先项是：把集合编辑链路从“先确认范围”升级为“先确认意思，再确认范围”。
- 但该近期优先项不能脱离 Phase 6.4 主轴单独存在，必须和 trace、metrics、replay、评测样本集一起落地，才能形成完整的优化闭环。

本阶段最终要回答 3 个问题：

1. 这次请求到底做了什么，为什么这样做，失败在哪一步。
2. 同类请求反复跑时，成功率、耗时、工具调用次数、版本冲突次数是否在改善。
3. 用户说“字段 / 项 / 控件”这类业务词汇时，系统能否先确认意思，再确认范围，而不是直接误改。

## 当前状态（2026-03-22）

- 当前集合修改链路已经具备：
  - 集合语义且未选容器 -> `clarification`
  - 集合语义且已选容器 -> `scope_confirmation`
  - 用户确认范围后 -> `patch` preview
  - patch 应用继续复用现有 patch/history/undo 机制
- 路线图前置能力默认已具备或正在主链路中使用：
  - `traceId` 基础透传
  - 前端阶段状态流 / SSE 事件
  - 结构化执行摘要基础
- 当前仍缺少的关键闭环：
  - 只能拿到 `traceId`，还不能稳定按 `traceId` 查完整执行轨迹
  - 缺少成体系的工具轨迹展示与失败复盘入口
  - 缺少统一 metrics 汇总，无法稳定统计成功率、耗时、工具调用次数、版本冲突次数
  - 缺少可重复执行的固定评测样本集
  - 集合编辑语义本身仍不稳定：
    - 用户常用的是业务词汇，如“字段 / 项 / 控件 / 输入项”
    - 当前后端更擅长识别明确组件类型词，如“表单项 / 按钮 / 输入框”
    - 因此系统缺少一层“先确认用户说的是什么，再确认要改哪些”的前置语义闭环

## 本阶段范围

### In Scope

- 工具轨迹展示
- metrics
- trace
- replay
- 评测样本集
- 集合编辑语义 alias registry
- intent normalization
- `intent_confirmation`
- 容器内候选过滤
- 与 `scope_confirmation` 的前后衔接，形成“先确认意思，再确认范围”的链路

### Out Of Scope

- 不改顶层 `answer / schema / patch` 自动路由
- 不重做现有 `clarification`、`scope_confirmation`、patch preview、patch apply、history/undo 主机制
- 不向前端透传模型原始思维链，只展示结构化执行摘要和工具轨迹
- 不在本阶段优先做跨项目持久记忆或 Memory System
- 不把 replay 扩展成“精确复现模型逐 token 推理”的能力，本阶段只做结构化执行回放与排障复盘

## 主迭代拆分

建议按一个主迭代收口，两条主线并行推进：

1. `P0 可观测性与评测基线`
   先把 trace、metrics、replay、样本集打通，保证后续所有优化都能被观察、复盘和量化。
2. `P0/P1 集合语义归一化`
   在 batch patch 主链路前补上 intent normalization / intent_confirmation，解决集合业务词汇误判问题。

## 关键变更

### 1. Trace 与工具轨迹闭环

- 在后端补齐完整的 trace 记录能力，保证任意一次 Agent 请求都能按 `traceId` 查到完整执行轨迹。
- trace 记录至少覆盖：
  - 请求入口信息：`traceId / sessionId / pageId / instruction / selectedId / rootId / baseVersion`
  - 阶段事件：分类、上下文读取、候选解析、guard 决策、确认状态切换、patch 预览、patch 应用前终态
  - 工具调用：工具名、输入摘要、输出摘要、耗时、命中节点摘要、失败码
  - 结束态：成功 / 失败 / 被确认卡住 / 被 guard 拦截 / 版本冲突
- 前端不展示原始思维链，只展示结构化轨迹摘要：
  - `traceId`
  - 阶段时间线
  - 工具调用列表
  - 最终命中节点 / finish reason / error code
- 失败请求必须能从当前消息跳到对应 trace 视图或等价的排障入口。

### 2. Metrics 基线

- 为 Agent 请求建立最小指标集，至少统计：
  - 成功率
  - 平均耗时
  - 工具调用次数
  - 版本冲突次数
- 指标维度至少支持：
  - 总体维度
  - `mode` 维度
  - 成功 / 失败 / 确认中断维度
  - 批量集合编辑语义链路维度
- 第一版不强制要求正式 dashboard，但必须至少输出到日志、查询接口或简易报表脚本，确保指标可追踪、可对比。

### 3. Replay 与失败复盘

- 新增最小 replay 能力，用于按 `traceId` 回放一次结构化执行过程。
- replay 的目标不是重新跑一遍模型，而是能稳定复盘：
  - 原始请求与页面版本
  - 关键上下文摘要
  - 每一步阶段切换
  - 每次工具调用与 guard 决策
  - 最终结果或失败原因
- replay 至少支持：
  - 成功请求回放
  - 失败请求回放
  - 版本冲突请求回放
  - 意图确认中断请求回放
- 回放结果应能服务两类场景：
  - 人工排障
  - 固定样本回归复核

### 4. 评测样本集与回归机制

- 建立最小可重复执行的评测样本集，第一版不少于 10 个固定场景。
- 样本应至少覆盖：
  - 简单单节点修改
  - 集合语义高置信命中
  - 集合语义多义需确认
  - 当前容器下无候选
  - 版本冲突
  - 工具失败
  - guard 拦截
  - 重复执行幂等
- 每个样本至少包含：
  - 输入指令
  - 前置页面状态或 snapshot 引用
  - 期望阶段序列
  - 期望最终模式或错误码
  - 是否要求出现 `intent_confirmation`
  - 是否要求出现 `scope_confirmation`
- 样本集必须能重复跑出结果，用于：
  - 评估语义归一化命中率
  - 评估成功率与平均耗时
  - 观察工具调用次数变化
  - 回归确认阶段链路是否退化

### 5. 语义归一化层

- 在后端新增集合编辑语义归一化层，默认命名为 `AgentIntentNormalizationService`。
- 归一化层只服务“集合语义 + patch/batch”场景，不介入顶层 `answer / schema / patch` 分类。
- 归一化结果分三类：
  - `normalized`：高置信映射到单一语义，静默继续
  - `confirmation_required`：存在两个及以上合理语义，返回 `intent_confirmation`
  - `no_match`：无稳定语义命中，回退到现有 `clarification` 或结构化拦截
- 默认不新增一轮模型调用，优先采用规则化 normalization，避免在 Phase 6.4 早期引入新的不稳定源。

### 6. Intent Confirmation 交互链路

- 新增响应模式 `intent_confirmation`，职责是确认“用户说的是什么意思”，不负责确认具体组件，也不负责确认批量范围。
- 多义时，前端展示业务语言选项，例如“字段”“输入框”“表单项”，不直接暴露 `FormItem`、`Input` 等组件术语。
- 用户确认后，请求透传 `confirmedIntentId`，同一条 assistant message 继续推进到下一阶段，不额外插入一条“伪用户消息”。
- 该阶段不触发画布高亮；范围高亮仍然只在 `scope_confirmation` 阶段出现。
- 确认后的 intent 结果要进入 trace，确保回放时能还原“当时用户确认了哪一个意思”。

### 7. 与现有 Scope Confirmation 的衔接

- 集合编辑主链路调整为：
  - 先校验当前是否选中了可用容器
  - 再做 intent normalization
  - 单一高置信语义：直接进入现有 `scope_confirmation`
  - 多义语义：先返回 `intent_confirmation`
  - 用户确认 intent 后，再进入现有 `scope_confirmation`
  - 用户确认 scope 后，再进入现有 batch patch preview
- `clarification / intent_confirmation / scope_confirmation` 三者职责保持清晰：
  - `clarification`：确认“具体对象”
  - `intent_confirmation`：确认“意思”
  - `scope_confirmation`：确认“批量范围”
- 现有 patch preview、风险确认、patch apply、history/undo 逻辑保持不变。
- 集合语义的多义表达不得直接误入 `scope_confirmation`。

### 8. Alias Registry 与容器内候选过滤

- 新增独立的语义 alias registry，不复用 `ComponentMetaRegistry` 里的技术 alias。
- 每条 alias 定义至少包含：
  - `semanticKey`
  - `targetType`
  - `label`
  - `description`
  - `aliases`
- v1 先覆盖集合编辑的高频业务语义，至少包括：
  - `字段 / 表单字段 / 输入项` -> 表单相关集合目标
  - `项 / 表单项` -> `FormItem`
  - `按钮` -> `Button`
  - `输入框 / 输入项` -> `Input` / `TextArea` 等可区分语义
- 候选过滤必须结合当前已选容器的 subtree，只允许返回当前容器下真实存在的语义候选，避免弹出与当前范围无关的选项。

### 9. 后端守卫与失效机制

- 为 intent confirmation 新增独立的待确认状态存储，形态对齐现有 scope confirmation：
  - 与 `sessionId` 绑定
  - 带 TTL
  - 校验 `instruction / pageId / rootId`
  - 确认后立即清理
- `resolve_collection_scope` 需要支持显式语义或目标类型输入；确认 intent 后，后续 scope planning 不再重新猜语义。
- 若页面、容器、原始指令或确认记录已变化，则 `confirmedIntentId` 立即失效并要求用户重新发起。
- 批量修改的硬守卫继续保留，intent confirmation 只能缩窄歧义，不能绕过后端范围约束。
- 所有 guard 决策与失效原因都应进入 trace，并可用于 metrics 聚合。

### 10. 前端消息状态、Intent 卡片与 Trace 展示

- 前端 AI 类型扩展 `intent_confirmation` 响应，以及对应的消息状态字段。
- `useAIAssistantChat` 需要支持：
  - 接收 `intent_confirmation`
  - 存储候选选项
  - 提交 `confirmedIntentId`
  - 原地推进同一条 assistant message 的阶段状态
  - 绑定当前消息的 `traceId`
- `AIAssistantMessageList` 新增意图确认卡片，视觉层级对齐现有 `clarification` / `scope_confirmation` 卡片，但文案要突出“先确认你的意思”。
- 进度状态新增 `awaiting_intent_confirmation`，让前端和 SSE 事件能明确呈现当前卡在语义确认，而不是目标解析或范围确认。
- 前端需要补一个最小 trace 摘要入口，至少展示：
  - `traceId`
  - 阶段时间线
  - 工具调用摘要
  - finish reason / error code
- 不在本阶段展示原始模型思考文本。

## 接口与类型变更

### 后端请求与响应

- `AgentEditRequestDto`
  - 新增 `confirmedIntentId?: string`
- `AgentEditResponse`
  - 保持已有 `traceId`
  - 新增 `mode: 'intent_confirmation'`
  - 新增 `intentConfirmationId: string`
  - 新增 `options: Array<{ intentId: string; label: string; description: string }>`
- `AgentMessageProgress`
  - 增加 `awaiting_intent_confirmation`
  - 增加可观测性需要的阶段事件摘要字段，确保 trace 与前端状态流可以对齐

### 后端服务层

- 新增 `AgentIntentNormalizationService`
- 新增 intent confirmation 状态存储服务
- 新增 `AgentTraceService`
- 新增 `AgentMetricsService`
- 新增 `AgentReplayService`

### Trace / Replay 查询接口

- 增加按 `traceId` 查询完整轨迹的后端能力，形式可为：
  - 调试接口
  - 内部管理接口
  - 服务层查询方法
- replay 能力至少支持：
  - 根据 `traceId` 返回结构化回放数据
  - 根据固定样本批量跑回归

### 前端类型

- 扩展 `intent_confirmation` 响应类型
- 扩展 `AIMessage` 的 intent confirmation state
- 扩展消息级 trace summary 类型
- 保持 `clarification / scope_confirmation / patch preview` 兼容不变

## 数据与产物建议

- trace 落盘或持久化形态可先从轻量实现开始，但必须满足：
  - 能按 `traceId` 查询
  - 能串起一次完整执行链路
  - 能支撑 replay
  - 能为 metrics 提供统计输入
- metrics 第一版可以先走：
  - 结构化日志
  - 定时汇总脚本
  - 简易 dashboard 或管理页
- 评测样本建议独立维护，避免散落在临时脚本中；样本与执行结果应可区分“用例定义”和“最近一次跑分结果”。

## 测试计划

### 可观测性 / Replay / Metrics

- Trace 测试：
  - 任意一次 Agent 请求都能返回 `traceId`
  - 能按 `traceId` 查到完整执行轨迹
  - 轨迹中包含阶段事件、工具调用摘要、finish reason、错误码
- Replay 测试：
  - 成功请求可回放
  - 失败请求可回放
  - 版本冲突请求可回放
  - intent confirmation 中断请求可回放
- Metrics 测试：
  - 能统计成功率
  - 能统计平均耗时
  - 能统计工具调用次数
  - 能统计版本冲突次数
  - guard 拦截与确认中断不会被误记为成功
- 前端可观测性测试：
  - 当前消息可展示 `traceId`
  - 可查看阶段时间线和工具调用摘要
  - 失败消息可定位到 trace 详情

### 评测样本集

- 固定 10 个以上场景样本可重复跑出结果
- 样本执行结果能输出：
  - 成功 / 失败
  - 阶段序列是否符合预期
  - 是否触发 `intent_confirmation`
  - 是否触发 `scope_confirmation`
  - 工具调用次数
  - 总耗时

### 归一化与确认链路

- 高频业务词汇能静默归一化到单一集合语义
- 多义词会返回 `intent_confirmation`
- 当前容器 subtree 不存在的候选不会出现在确认选项中
- “所有字段” + 已选表单容器时，先返回 `intent_confirmation`
- 确认 intent 后，进入现有 `scope_confirmation`
- 确认 scope 后，进入现有 batch patch preview
- `confirmedIntentId` 在 `sessionId / pageId / rootId / instruction` 变化时失效

### 前端意图确认链路

- `intent_confirmation` 能被正确落入消息状态
- 选择语义选项后会透传 `confirmedIntentId`
- 同一条 assistant message 原地推进，不新增多余消息
- intent confirmation 阶段不会触发范围高亮
- 后续 `scope_confirmation` 与 patch preview 回归保持通过

### E2E

- 发送“把所有字段的 label 宽度改成 200”
  - 第一步返回 `intent_confirmation`
  - 第二步确认语义后返回 `scope_confirmation`
  - 第三步确认范围后返回 `patch` preview
- 发送“把当前表单下所有表单项的 label 宽度改成 200”
  - 直接跳过 intent confirmation
  - 进入现有 `scope_confirmation`
- 发送“把所有按钮和字段都隐藏”
  - 不直接执行
  - 返回多义确认、澄清或结构化拦截
- 构造一次失败请求
  - 前端拿到 `traceId`
  - 能按 `traceId` 查到工具轨迹
  - 可完成一次人工复盘

## 本阶段完成标志

- 能按 `traceId` 查完整执行轨迹
- 至少有一套可重复执行的样本集
- 至少能统计成功率、耗时、工具调用次数、版本冲突次数
- 集合语义的多义表达不会直接误入范围确认
- 非技术用户看到的是业务语言选项，而不是组件类型术语
- 高置信语义不增加额外确认打断

## 最小验证机制

- [ ] 可观测性验证：任意一次 Agent 请求都能拿到 `traceId`
- [ ] 可观测性验证：能根据 `traceId` 查到工具轨迹
- [ ] 回放验证：任选一次成功请求和一次失败请求，均可完成结构化回放
- [ ] 评测验证：固定 10 个场景样本，能重复跑
- [ ] 指标验证：至少输出到日志或简单 dashboard
- [ ] 人工排障验证：通过一次失败请求完成复盘
- [ ] 语义验证：集合业务词汇的多义表达不会直接进入范围确认
- [ ] 交互验证：前端展示业务语言选项，而不是组件类型术语
- [ ] 无打断验证：高置信语义命中时不会增加额外确认步骤

## 假设与默认决策

- Phase 6.4 默认不新增模型参与的 intent normalization；先用规则化 alias registry 收口高频集合语义。
- 本阶段只补齐 Phase 6.4 主轴要求的可观测性、回放、评测闭环，以及集合语义归一化，不回头重做 Phase 6.1 到 Phase 6.3 已确定的范围。
- `intent_confirmation` 只确认语义，不承担候选节点澄清或范围确认职责。
- replay 第一版是结构化执行回放，不是精确复刻模型内部推理过程。
- metrics 第一版允许先落在日志、脚本或轻量报表，只要能支持稳定统计和回归对比即可。
- 路线图继续保留“可观测性、回放与评测闭环”主轴，本阶段的集合语义归一化被视为该阶段的近期优先补充项，而不是另起新 phase。
