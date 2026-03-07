/** 属性编辑器类型 */
export type EditorType =
  | "string" // 文本输入
  | "number" // 数字输入
  | "boolean" // Switch
  | "select" // 下拉选择
  | "color" // 颜色选择器
  | "json" // JSON 编辑器
  | "slot" // 插槽（children 配置）
  | "expression"; // 表达式绑定

/** 单个属性的面板配置 */
export interface PropertyMeta {
  key: string; // props 中的键名
  label: string; // 显示名称
  editor: EditorType; // 编辑器类型
  defaultValue?: unknown; // 默认值
  description?: string; // 帮助文本
  required?: boolean;
  group?: string; // 分组（基础/样式/高级/事件）
  options?: Array<{ label: string; value: string | number }>; // select 类型的选项
  visible?: (props: Record<string, unknown>) => boolean; // 条件显示
}

/** 组件的属性面板配置 */
export interface ComponentPanelConfig {
  componentType: string; // 组件类型名
  displayName: string; // 在面板中显示的名称
  icon?: string; // 图标
  category: "layout" | "form" | "display" | "feedback" | "typography";
  properties: PropertyMeta[];
  // 未来扩展：
  // events?: EventMeta[];
  // slots?: SlotMeta[];
}
