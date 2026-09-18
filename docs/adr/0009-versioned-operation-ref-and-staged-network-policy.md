# ADR-0009：精确 OperationRef 与分阶段网络策略

> Status: Proposed；2026-09-18；设计方向已认可，细节待冻结；补充 ADR-0005，未启用。

建议页面引用精确 operationId/revision，禁止隐式 latest；跨环境只替换可信基础设施绑定，不改变操作契约。相比无版本引用，这增加注册与迁移成本，但避免旧页面被新的参数、权限和结果语义静默改变。

建议以可信部署策略区分 legacy 与 operation-only，新能力只在后者开放并递归拒绝旧 apiCall；旧页面显式迁移，不静默删除。相比同时放开两条网络路径，这保留阶段性兼容且防止旧 URL 动作绕过 OperationRef。代价是迁移期需要资产清单和双模式回归，V1 前必须决定 legacy 退役范围。

字段、验收和待确认项见 `docs/plans/m1b-0-readonly-data-source-design.md`。本 ADR 记录已认可方向，正式协议仍待冻结；不代表实施授权或已经改动运行时。
