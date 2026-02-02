import type { A2UISchema, A2UIComponent } from "../types";

/**
 * 遍历 Flat A2UI Schema，提取所有组件的初始值
 * 返回 {[id]: value} 结构
 */
export function flattenSchemaValues(schema: A2UISchema): Record<string, any> {
  const values: Record<string, any> = {};
  const { components } = schema;

  if (!components) return values;

  Object.values(components).forEach((node: A2UIComponent) => {
    if (node.id) {
      // 提取初始值
      // 优先级：props.initialValue > props.value > props.defaultValue
      // 1. 优先使用 initialValue (通用)
      if (node.props?.initialValue !== undefined) {
        values[node.id] = node.props.initialValue;
      }
      // 2. Form 组件特殊处理: initialValues
      else if (
        node.type === "Form" &&
        node.props?.initialValues !== undefined
      ) {
        values[node.id] = node.props.initialValues;
      }
      // 3. 兼容旧属性 (可选，视需要决定是否保留)
      else if (node.props?.value !== undefined) {
        values[node.id] = node.props.value;
      } else if (node.props?.defaultValue !== undefined) {
        values[node.id] = node.props.defaultValue;
      }
    }
  });

  return values;
}
