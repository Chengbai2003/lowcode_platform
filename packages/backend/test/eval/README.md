# Agent Eval（Issue #18 / M0-3）

两条隔离的评测通道：

```text
eval:deterministic → CI blocking（无网络、无模型凭据）
eval:live          → 手动/定时趋势观测（需要真实模型凭据与运行中的后端）
```

## 运行

```bash
pnpm eval:deterministic   # jest --config ./test/eval/jest.eval.config.js（CI 阻断）
pnpm eval:live            # 需 AGENT_EVAL_BASE_URL + AGENT_EVAL_TOKEN；不进 CI
```

- `eval:deterministic`：模型输出以 `cases/*.case.json` 的 Fixture 回放，经 Agent
  真实的确定性后处理管线（Contract 校验 → Patch 归一化/风险评估 → 安全校验器 →
  Repository CAS）执行；同一代码跑两遍逐键比对（Replay Reproducibility）；
  报告写入 `.codex/artifacts/agent-eval/deterministic.{json,md}`。
- `eval:live`：对运行中的后端 `POST /agent/edit` 发送用例 intent，记录延迟、
  路由与 First-pass Success Rate，写入 `.codex/artifacts/agent-eval/live/`。

## 指标

| 指标                       | 含义                                                                    |
| -------------------------- | ----------------------------------------------------------------------- |
| Schema Valid Rate          | 声明 `schemaValid` 期望的用例中实际一致的比例                           |
| Expected Outcome Rate      | 全部用例 expected 与 actual 一致的比例（门禁 = 100%）                   |
| Patch Minimality           | patch 用例 `normalizedOps/submittedOps` 均值（归一化去 no-op 的产出率） |
| Safety Block Rate          | safety 用例按期望拦截的比例                                             |
| Version Conflict Integrity | conflict 用例一致的比例（CAS 拒绝过期/缺失基线）                        |
| Replay Reproducibility     | 两次独立运行结果一致的比例（门禁 = 100%）                               |

## 新增 / 审查 / 更新 Eval Case

1. 在 `cases/` 新增 `<id>.case.json`，`caseSchemaVersion` 必须等于
   `eval-case.types.ts` 中的 `EVAL_CASE_SCHEMA_VERSION`；
2. `category` 决定执行管线：`draft`（模型输出 Schema 回放校验）、
   `patch`（归一化 + 风险评估）、`validation`（非法输入拦截）、
   `conflict`（Repository CAS 步骤序列）、`safety`（表达式/Schema 安全校验器）；
3. `expected` 只声明用例关心的键，runner 产出同构 `actual` 逐键深度比较；
4. **黄金答案纪律**：修改 `expected` 必须在 PR 说明中解释原因；
   禁止为让新实现通过而静默放宽 ExpectedOutcome；
5. M1a/M1b 未实现的 State、ActionFlow、DataSource 能力不得计入 M0 成功率；
   暂不建 case，等对应 Milestone 转为正式基线。

## 基线配额（M0 = 20 例）

draft 4 / patch 6 / validation 4 / conflict 3 / safety 3。
