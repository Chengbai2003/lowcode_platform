import React from 'react';
import type { ComponentSchema, RendererProps, ComponentRegistry } from './types';

/**
 * 事件派发中心
 * 负责解析和执行 JSON Schema 中定义的事件代码
 */
class EventDispatcher {
  private context: Record<string, any>;

  constructor(context: Record<string, any> = {}) {
    this.context = context;
  }

  /**
   * 更新执行上下文
   */
  setContext(key: string, value: any) {
    this.context[key] = value;
  }

  /**
   * 获取完整上下文
   */
  getContext(): Record<string, any> {
    return { ...this.context };
  }

  /**
   * 执行事件代码
   * @param code 要执行的代码字符串
   * @param event 原始事件对象
   * @param extraArgs 额外参数
   */
  execute(code: string, event?: Event, ...extraArgs: any[]): any {
    try {
      // 构建执行函数：传入上下文变量、事件对象和额外参数
      const contextKeys = Object.keys(this.context);
      const contextValues = Object.values(this.context);

      // 创建执行函数，参数为上下文变量和事件
      const args = [...contextKeys, 'event', ...extraArgs.map((_, i) => `arg${i}`)];
      const fn = new Function(...args, code);

      // 执行函数
      return fn(...contextValues, event, ...extraArgs);
    } catch (error) {
      console.error('Event execution error:', error);
      console.error('Failed code:', code);
      throw error;
    }
  }

  /**
   * 创建事件处理器
   */
  createHandler(code: string) {
    return (event: Event, ...extraArgs: any[]) => {
      return this.execute(code, event, ...extraArgs);
    };
  }
}

/**
 * 默认内置组件
 */
const builtInComponents: ComponentRegistry = {
  // 容器组件
  Page: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  Div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  Span: ({ children, ...props }: any) => <span {...props}>{children}</span>,

  // 布局组件
  Container: ({ children, style, ...props }: any) => (
    <div style={{ ...style, padding: '16px' }} {...props}>{children}</div>
  ),
  Row: ({ children, style, ...props }: any) => (
    <div style={{ ...style, display: 'flex', flexDirection: 'row' }} {...props}>{children}</div>
  ),
  Col: ({ children, style, ...props }: any) => (
    <div style={{ ...style, flex: 1 }} {...props}>{children}</div>
  ),

  // 文本组件
  Text: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  Title: ({ children, level = 1, ...props }: any) => {
    const HeadingTag = `h${level}` as keyof JSX.IntrinsicElements;
    return <HeadingTag {...props}>{children}</HeadingTag>;
  },
  Paragraph: ({ children, ...props }: any) => <p {...props}>{children}</p>,

  // 表单组件（占位符 - 实际使用 components 包中的 Ant Design 组件）
  Input: (props: any) => <input {...props} />,
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  TextArea: (props: any) => <textarea {...props} />,

  // 展示组件
  Image: ({ src, alt, ...props }: any) => <img src={src} alt={alt} {...props} />,
  Link: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
};

/**
 * 类型守卫：检查值是否为 ComponentSchema
 */
function isComponentSchema(value: unknown): value is ComponentSchema {
  return typeof value === 'object' && value !== null && 'componentName' in value;
}

/**
 * 递归渲染子组件
 */
function renderChildren(
  children: ComponentSchema | ComponentSchema[] | string | string[] | undefined,
  components: ComponentRegistry,
  eventDispatcher?: EventDispatcher,
  onComponentClick?: (schema: ComponentSchema) => void
): React.ReactNode {
  if (children === undefined || children === null) {
    return null;
  }

  if (typeof children === 'string' || typeof children === 'number') {
    return children;
  }

  if (Array.isArray(children)) {
    return children.map((child, index) => {
      if (typeof child === 'string') {
        return child;
      }
      if (isComponentSchema(child)) {
        return <ComponentRenderer key={child.id || `child-${index}`} schema={child} components={components} eventDispatcher={eventDispatcher} onComponentClick={onComponentClick} />;
      }
      return null;
    });
  }

  return <ComponentRenderer schema={children} components={components} eventDispatcher={eventDispatcher} onComponentClick={onComponentClick} />;
}

/**
 * 单个组件渲染器
 */
function ComponentRenderer({
  schema,
  components,
  eventDispatcher,
  onComponentClick
}: {
  schema: ComponentSchema;
  components: ComponentRegistry;
  eventDispatcher?: EventDispatcher;
  onComponentClick?: (schema: ComponentSchema) => void;
}): React.ReactElement | null {
  const { componentName, props = {}, children, events = {} } = schema;

  // 从注册表或内置组件中获取组件
  const Component = components[componentName] || builtInComponents[componentName];

  // 组件未找到时降级为 div（容错处理）
  if (!Component) {
    console.warn(`Component "${componentName}" not found in registry, rendering as div`);

    // 处理事件
    const eventHandlers = buildEventHandlers(events, eventDispatcher);

    return (
      <div {...props} {...eventHandlers} data-fallback-component={componentName}>
        {renderChildren(children, components, eventDispatcher, onComponentClick)}
      </div>
    );
  }

  // 构建事件处理器
  const eventHandlers = buildEventHandlers(events, eventDispatcher);

  // 合并 props 和事件处理器
  const mergedProps = { ...props, ...eventHandlers };

  // 渲染组件及其子组件
  const element = (
    <Component {...mergedProps}>
      {renderChildren(children, components, eventDispatcher, onComponentClick)}
    </Component>
  );

  // 如果提供了点击处理器，包裹一层
  if (onComponentClick) {
    return (
      <div
        onClick={(e) => {
          onComponentClick(schema);
        }}
        style={{ cursor: 'pointer' }}
        data-component-id={schema.id}
      >
        {element}
      </div>
    );
  }

  return element;
}

/**
 * 根据事件定义构建事件处理器对象
 */
function buildEventHandlers(
  events: Record<string, string>,
  eventDispatcher?: EventDispatcher
): Record<string, (...args: any[]) => any> {
  if (!eventDispatcher || Object.keys(events).length === 0) {
    return {};
  }

  const handlers: Record<string, (...args: any[]) => any> = {};

  for (const [eventName, code] of Object.entries(events)) {
    handlers[eventName] = eventDispatcher.createHandler(code);
  }

  return handlers;
}

/**
 * 主渲染器组件
 */
export function Renderer({
  schema,
  components = {},
  onComponentClick,
  eventContext = {}
}: RendererProps): React.ReactElement {
  // 创建事件派发器实例
  const eventDispatcher = new EventDispatcher(eventContext);
  const allComponents = { ...builtInComponents, ...components };

  return <ComponentRenderer schema={schema} components={allComponents} eventDispatcher={eventDispatcher} onComponentClick={onComponentClick} />;
}

/**
 * 导出内置组件供自定义使用
 */
export { builtInComponents };
