/**
 * 组件定义的 JSON Schema 类型
 */
export interface ComponentSchema {
  componentName: string;              // 组件名称
  props?: Record<string, any>;         // 组件属性
  children?: ComponentSchema | ComponentSchema[] | string | string[];  // 子组件
  id?: string;                         // 可选的唯一标识
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
}
