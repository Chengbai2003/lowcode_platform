/**
 * 组件定义的 JSON Schema 类型
 */
export interface ComponentSchema {
  componentName: string;              // 组件名称
  props?: Record<string, any>;         // 组件属性
  children?: ComponentSchema | ComponentSchema[] | string | string[];  // 子组件
  id?: string;                         // 可选的唯一标识
  events?: Record<string, string | string[]>;     // 事件定义，key 为事件名，value 为执行的代码（支持单条或多条代码链）
}

/**
 * 组件注册表类型
 */
export type ComponentRegistry = Record<
  string,
  React.ComponentType<any>
>;

/**
 * 渲染器组件的 Props 类型
 */
export interface RendererProps {
  schema: ComponentSchema;                                    // JSON Schema
  components?: ComponentRegistry;                             // 自定义组件注册表
  onComponentClick?: (schema: ComponentSchema) => void;      // 组件点击回调
  eventContext?: Record<string, any>;                        // 事件执行上下文（可在事件代码中使用的变量）
}
