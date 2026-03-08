/**
 * 逃生舱 Action
 *
 * 当内置 Action 无法满足复杂逻辑时，允许执行自定义脚本。
 *
 * 使用场景：
 * - 复杂数据转换
 * - 特殊业务逻辑
 * - 临时解决方案
 *
 * 示例：
 * { type: "customScript", code: "return data.items.filter(x => x.active > 0)" }
 */
export type CustomScriptAction = {
  type: 'customScript';
  /** JavaScript 代码（表达式或语句块） */
  code: string;
  /** 执行超时时间(ms)，默认 10000 */
  timeout?: number;
};
