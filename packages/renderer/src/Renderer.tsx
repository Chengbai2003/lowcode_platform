import React, { useMemo, useEffect, memo } from 'react';
import type { ComponentSchema, RendererProps, ComponentRegistry } from './types';
import { useAppDispatch, useAppSelector } from './store/hooks';
import { setComponentData, setComponentConfig, setMultipleComponentData } from './store/componentSlice';
import { store } from './store';
import { flattenSchemaValues } from './utils/schema';
import { shallowEqual } from 'react-redux';

/**
 * 事件派发中心
 * 负责解析和执行 JSON Schema 中定义的事件代码
 */
export class EventDispatcher {
  private context: Record<string, any>;
  private dispatch: any;
  private getState: any;

  constructor(
    context: Record<string, any> = {},
    dispatch: any,
    getState: any
  ) {
    this.context = context;
    this.dispatch = dispatch;
    this.getState = getState;
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
    return {
      ...this.context,
      dispatch: this.dispatch,
      getState: this.getState,
      setComponentData: (id: string, value: any) => {
        this.dispatch(setComponentData({ id, value }));
      },
      setComponentConfig: (id: string, config: any) => {
        this.dispatch(setComponentConfig({ id, config }));
      }
    };
  }

  /**
   * 执行单个函数体的辅助方法
   */
  private executeSingle(code: string, event: any, args: any[], contextValues: any[]): any {
    try {
      // 自动包裹函数体，确保是合法的函数执行
      // 如果代码没有以 return 开头，或者只有一行，可以考虑添加 return (视需求而定，这里保持原逻辑，只包裹)
      // 用户代码通常是: "console.log(event); return true;"
      const fn = new Function(...args, code);
      return fn(...contextValues, event);
    } catch (error) {
      console.warn('Event Logic Error:', error);
      throw error; // 向上抛出，中断链
    }
  }

  /**
   * 执行事件代码
   * @param code 要执行的代码字符串或字符串数组
   * @param event 原始事件对象
   * @param extraArgs 额外参数
   */
  execute(code: string | string[], event?: Event | any, ...extraArgs: any[]): any {
    try {
      // 获取上下文
      const ctx = this.getContext();
      const contextKeys = Object.keys(ctx);
      const contextValues = Object.values(ctx);
      const args = [...contextKeys, 'event', ...extraArgs.map((_, i) => `arg${i}`)];

      // 如果是数组，进行链式执行
      if (Array.isArray(code)) {
        let result: any;
        for (const snippet of code) {
          try {
            result = this.executeSingle(snippet, event, args, contextValues);
          } catch (e) {
            console.error('Chain Execution Interrupted due to error in snippet:', snippet);
            break; // 中断链
          }
        }
        return result; // 返回最后一个执行结果
      }

      // 单条执行
      return this.executeSingle(code, event, args, contextValues);

    } catch (error) {
      console.error('Event Execution System Error:', error);
    }
  }

  /**
   * 创建事件处理器
   */
  createHandler(code: string | string[]) {
    return (event: any, ...extraArgs: any[]) => {
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
// 保持原样
function isComponentSchema(value: unknown): value is ComponentSchema {
  return typeof value === 'object' && value !== null && 'componentName' in value;
}

/**
 * Form 同步包装器
 * 负责连接 Redux Store 和 Ant Design Form 实例
 * 处理 Redux -> Form 的入站同步
 */
const FormSyncWrapper = ({
  Component,
  mergedProps,
  childrenElements,
  id,
  componentValue
}: {
  Component: any;
  mergedProps: any;
  childrenElements: React.ReactNode;
  id?: string;
  componentValue: any;
}) => {
  // 尝试获取 useForm，如果不存在则报错或回退（这里假设一定存在，外层会判断）
  // 注意： hooks 必须在 render 顶层调用，所以 ComponentRenderer 中必须保证条件渲染的一致性
  // 但这里我们是在 FormSyncWrapper 内部调用，只要 FormSyncWrapper 被渲染，useForm 就会被调用
  const [form] = Component.useForm();

  // 监听 Redux Store 值变化，同步到 Form 实例
  useEffect(() => {
    if (componentValue) {
      // 使用 setFieldsValue 更新表单，这不会触发 onValuesChange，避免循环更新
      form.setFieldsValue(componentValue);
    }
  }, [componentValue, form]);

  return (
    <Component {...mergedProps} form={form} id={id}>
      {childrenElements}
    </Component>
  );
};

/**
 * 纯展示组件 (Pure Component)
 * 只负责接收 props 并渲染，不连接 Store
 * 使用 React.memo 避免不必要的重绘
 */
const BaseComponent = memo(({
  Component,
  mergedProps,
  childrenElements,
  id
}: {
  Component: React.ComponentType<any>;
  mergedProps: any;
  childrenElements: React.ReactNode;
  id?: string;
}) => {
  return (
    <Component {...mergedProps} id={id}>
      {childrenElements}
    </Component>
  );
}, (prevProps, nextProps) => {
  // 自定义比较逻辑
  // 1. Component 必须相同
  if (prevProps.Component !== nextProps.Component) return false;
  // 2. ID 必须相同
  if (prevProps.id !== nextProps.id) return false;
  // 3. Children 必须相同 (引用比较)
  if (prevProps.childrenElements !== nextProps.childrenElements) return false;
  // 4. Props 必须浅层相等 (mergedProps 包含 style, className, value, onChange 等)
  if (!shallowEqual(prevProps.mergedProps, nextProps.mergedProps)) return false;

  return true;
});

/**
 * 单个组件渲染器 (Connected Component)
 * 负责连接 Store，获取数据，构建 props
 */
const ComponentRenderer = memo(({
  schema,
  components,
  eventDispatcher,
  onComponentClick,
  ...restProps // 接收来自父组件（如 Form.Item）注入的 props
}: {
  schema: ComponentSchema;
  components: ComponentRegistry;
  eventDispatcher?: EventDispatcher;
  onComponentClick?: (schema: ComponentSchema) => void;
  [key: string]: any; // 允许其他 props
}) => {
  const { componentName, props = {}, children, events = {}, id } = schema;
  const dispatch = useAppDispatch();

  // 从 Store 获取组件数据（如果有 ID）
  // 使用 useAppSelector 自动订阅更新
  const componentValue = useAppSelector(state =>
    id ? state.components.data[id] : undefined
  );

  // 从注册表或内置组件中获取组件
  const Component = components[componentName] || builtInComponents[componentName];

  // 构建事件处理器
  // 使用 useMemo 优化
  const eventHandlers = useMemo(() => {
    return buildEventHandlers(events, eventDispatcher);
  }, [events, eventDispatcher]);

  // 递归渲染子组件
  // 注意：我们在这里调用 renderChildren，它会返回 ReactNode (Element[]).
  // 这些 Element 是新的对象，所以 BaseComponent 的 childrenElements prop 每次都会变。
  // 这会导致 BaseComponent 更新。这是预期的，因为如果 subtree 变了，我们需要更新。
  const childrenElements = useMemo(() => {
    return renderChildren(children, components, eventDispatcher, onComponentClick);
  }, [children, components, eventDispatcher, onComponentClick]);

  if (!Component) {
    console.warn(`Component "${componentName}" not found in registry, rendering as div`);
    return (
      <div {...props} {...eventHandlers} {...restProps} data-fallback-component={componentName}>
        {childrenElements}
      </div>
    );
  }

  // 构建合并的 props
  const mergedProps = useMemo(() => {
    // 优先级：Schema Props < Form.Item Props (restProps) < Event Handlers < Redux Value
    const p = { ...props, ...restProps, ...eventHandlers };

    // Redux 值优先
    // 注意：如果 Form.Item 也传入了 value，我们优先使用 Redux store 的值
    if (componentValue !== undefined) {
      p.value = componentValue;
    }

    // 如果有 ID，拦截/增强 onChange
    // 注意：容器组件（如 Form）不应拦截 onChange，因为 DOM 事件冒泡会导致 Form 的值被子组件的值覆盖
    // 但是 Form 需要拦截 onValuesChange
    const isContainer = ['Form', 'Page', 'Div', 'Container', 'Card', 'Row', 'Col', 'Layout', 'Header', 'Content', 'Footer', 'Sider'].includes(componentName);

    if (id) {
      // 特殊处理 Form：同步 onValuesChange
      if (componentName === 'Form') {
        const originalOnValuesChange = p.onValuesChange;
        p.onValuesChange = (changedValues: any, allValues: any, ...args: any[]) => {
          // Form 数据变动，同步到 Redux
          const newValue = { ...(componentValue || {}), ...allValues };
          dispatch(setComponentData({ id, value: newValue }));

          if (originalOnValuesChange) {
            originalOnValuesChange(changedValues, allValues, ...args);
          }
        };

        // Form 初始化时也提供 initialValues (如果 Store 中有值)
        if (componentValue !== undefined) {
          p.initialValues = componentValue;
          // 注意：Ant Design Form 的 initialValues 只在初始化时生效。
          // 如果需要动态控制 Form 的值，应该使用 fields 属性或 form instance (setFieldsValue)。
          // 这里为了简单，我们假设 Form 是受控的或者重新挂载时生效。
          // 实际上，如果 Store 变了，我们需要通过 useEffect 调用 form.setFieldsValue。
          // 但这里 ComponentRenderer 无法直接访问 form instance (除非使用 useForm)。
          // 为了简化模型，我们暂时只处理初始化和 outbound sync (Form -> Redux)。
          // Inbound sync (Redux -> Form) 需要更复杂的处理（透传 form prop 或 ref）。
        }
      }
      else if (!isContainer) {
        // 普通组件处理
        const originalOnChange = p.onChange;

        p.onChange = (e: any, ...args: any[]) => {
          let value = e;
          // 尝试处理常见的 Event 对象
          if (e && e.target && 'value' in e.target) {
            value = e.target.value;
          } else if (e && e.target && 'checked' in e.target) {
            value = e.target.checked;
          }

          // 1. 更新 Redux Store
          dispatch(setComponentData({ id, value }));

          // 2. 调用原始的 onChange
          if (restProps.onChange) {
            restProps.onChange(e, ...args);
          }

          if (originalOnChange && originalOnChange !== restProps.onChange) {
            originalOnChange(e, ...args);
          }
        };
      }
    }

    // 移除 initialValue，因为它只用于 Store 初始化，不应传递给 DOM 元素
    // 但保留 initialValues (用于 Form)
    if (Reflect.has(p, 'initialValue')) {
      Reflect.deleteProperty(p, 'initialValue');
    }

    return p;
  }, [props, restProps, eventHandlers, componentValue, id, dispatch, componentName]);

  // 决定渲染内容
  const content = (componentName === 'Form' && (Component as any).useForm) ? (
    <FormSyncWrapper
      Component={Component}
      mergedProps={mergedProps}
      childrenElements={childrenElements}
      id={id}
      componentValue={componentValue}
    />
  ) : (
    <BaseComponent
      Component={Component}
      mergedProps={mergedProps}
      childrenElements={childrenElements}
      id={id}
    />
  );

  // 处理点击 - 外层包裹 div (用于编辑器选区高亮等)
  if (onComponentClick) {
    return (
      <div
        onClick={(e) => {
          e.stopPropagation();
          onComponentClick(schema);
        }}
        style={{ cursor: 'pointer', position: 'relative' }}
        data-component-id={id}
        className="lowcode-component-wrapper"
      >
        {content}
      </div>
    );
  }

  return content;
});

/**
 * 递归渲染子组件
 */
function renderChildren(
  children: ComponentSchema | ComponentSchema[] | string | string[] | undefined,
  components: ComponentRegistry,
  eventDispatcher?: EventDispatcher,
  onComponentClick?: (schema: ComponentSchema) => void
): React.ReactNode {
  if (children === undefined || children === null) return null;
  if (typeof children === 'string' || typeof children === 'number') return children;

  if (Array.isArray(children)) {
    return children.map((child, index) => {
      if (typeof child === 'string') return child;
      if (isComponentSchema(child)) {
        return <ComponentRenderer key={child.id || `child-${index}`} schema={child} components={components} eventDispatcher={eventDispatcher} onComponentClick={onComponentClick} />;
      }
      return null;
    });
  }

  return <ComponentRenderer schema={children} components={components} eventDispatcher={eventDispatcher} onComponentClick={onComponentClick} />;
}

/**
 * 根据事件定义构建事件处理器对象
 */
function buildEventHandlers(
  events: Record<string, string | string[]>,
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
  const dispatch = useAppDispatch();

  // 1. 初始化 Store 数据 (Flatten Schema)
  useEffect(() => {
    if (schema) {
      const flattenedData = flattenSchemaValues(schema);
      if (Object.keys(flattenedData).length > 0) {
        // 使用批量更新
        dispatch(setMultipleComponentData(flattenedData));
      }
    }
  }, [schema, dispatch]);

  const eventDispatcher = useMemo(() => {
    return new EventDispatcher(eventContext, dispatch, store.getState);
  }, [dispatch]); // components/schema 变化不应重建 dispatcher

  // 如果 eventContext 变化了，更新 dispatcher 的上下文
  useMemo(() => {
    if (eventContext) {
      Object.entries(eventContext).forEach(([key, value]) => {
        eventDispatcher.setContext(key, value);
      });
    }
  }, [eventContext, eventDispatcher]);

  const allComponents = { ...builtInComponents, ...components };

  return <ComponentRenderer schema={schema} components={allComponents} eventDispatcher={eventDispatcher} onComponentClick={onComponentClick} />;
}

/**
 * 导出内置组件供自定义使用
 */
export { builtInComponents };
