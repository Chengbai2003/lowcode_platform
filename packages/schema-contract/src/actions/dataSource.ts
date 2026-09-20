/**
 * 只读数据源执行动作（M1b-1 / ADR-0005 / ADR-0009）。
 *
 * 通过 `sourceId` 引用 `logic.dataSources` 中的具名声明；执行语义由宿主
 * DataSource capability 提供（M1b-1 B/C 阶段交付），Contract 只负责结构
 * 与引用校验。首版不支持动作级 onSuccess/onError 嵌套 —— Flow 级 onError
 * 已覆盖可恢复错误语义（ADR-0008）。
 */
export interface ExecuteDataSourceAction {
  readonly type: 'executeDataSource';
  /** 引用当前页 `logic.dataSources` 的具名 Logic Key。 */
  readonly sourceId: string;
  /**
   * 结果提交目标：精确 `state.<key>` 单段顶层槽位，且 `<key>` 必须已在
   * `logic.states` 声明。写入值是宿主校验后的完整公开 JSON 结果。
   */
  readonly resultTo: string;
}
