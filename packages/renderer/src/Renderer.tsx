import React, { useMemo, useEffect, memo } from 'react';
import type { RendererProps, ComponentRegistry, A2UIComponent } from './types';
import { useAppDispatch, useAppSelector } from './store/hooks';
import { setComponentData, setComponentConfig, setMultipleComponentData } from './store/componentSlice';
import { store } from './store';
import { flattenSchemaValues } from './utils/schema';
import { deepEqual } from './utils/compare';
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
      const fn = new Function(...args, code);
      return fn(...contextValues, event);
    } catch (error) {
      console.warn('Event Logic Error:', error);
      throw error; // 向上抛出，中断链
    }
  }

  /**
   * 执行事件代码
   */
  execute(code: string | string[], event?: Event | any, ...extraArgs: any[]): any {
    try {
      const ctx = this.getContext();
      const contextKeys = Object.keys(ctx);
      const contextValues = Object.values(ctx);
      const args = [...contextKeys, 'event', ...extraArgs.map((_, i) => `arg${i}`)];

      if (Array.isArray(code)) {
        let result: any;
        for (const snippet of code) {
          try {
            result = this.executeSingle(snippet, event, args, contextValues);
          } catch (e) {
            console.error('Chain Execution Interrupted due to error in snippet:', snippet);
            break;
          }
        }
        return result;
      }

      return this.executeSingle(code, event, args, contextValues);

    } catch (error) {
      console.error('Event Execution System Error:', error);
    }
  }

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
  Page: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  Div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  Span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  Container: ({ children, style, ...props }: any) => (
    <div style={{ ...style, padding: '16px' }} {...props}>{children}</div>
  ),
  Row: ({ children, style, ...props }: any) => (
    <div style={{ ...style, display: 'flex', flexDirection: 'row' }} {...props}>{children}</div>
  ),
  Col: ({ children, style, ...props }: any) => (
    <div style={{ ...style, flex: 1 }} {...props}>{children}</div>
  ),
  Text: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  Title: ({ children, level = 1, ...props }: any) => {
    const HeadingTag = `h${level}` as keyof JSX.IntrinsicElements;
    return <HeadingTag {...props}>{children}</HeadingTag>;
  },
  Paragraph: ({ children, ...props }: any) => <p {...props}>{children}</p>,
  Input: (props: any) => <input {...props} />,
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  TextArea: (props: any) => <textarea {...props} />,
  Image: ({ src, alt, ...props }: any) => <img src={src} alt={alt} {...props} />,
  Link: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
};

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
  const [form] = Component.useForm();

  useEffect(() => {
    if (componentValue) {
      const currentFormValues = form.getFieldsValue();
      if (!deepEqual(currentFormValues, componentValue)) {
        form.setFieldsValue(componentValue);
      }
    }
  }, [componentValue, form]);

  return (
    <Component {...mergedProps} form={form} id={id}>
      {childrenElements}
    </Component>
  );
};

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
  if (prevProps.Component !== nextProps.Component) return false;
  if (prevProps.id !== nextProps.id) return false;
  if (prevProps.childrenElements !== nextProps.childrenElements) return false;
  if (!shallowEqual(prevProps.mergedProps, nextProps.mergedProps)) return false;
  return true;
});

const ComponentRenderer = memo(({
  onComponentClick,
  components,
  eventDispatcher,
  nodeId,
  flatComponents,
  ...restProps
}: {
  nodeId: string;
  flatComponents: Record<string, A2UIComponent>;
  components: ComponentRegistry;
  eventDispatcher?: EventDispatcher;
  onComponentClick?: (node: A2UIComponent) => void;
  [key: string]: any;
}) => {
  const node = flatComponents[nodeId];
  if (!node) return null;

  const { type: componentName, props = {}, childrenIds, events = {}, id } = node;

  if (!componentName) return null;

  const dispatch = useAppDispatch();
  const componentValue = useAppSelector(state =>
    id ? state.components.data[id] : undefined
  );

  const Component = components[componentName] || builtInComponents[componentName];

  const eventHandlers = useMemo(() => {
    return buildEventHandlers(events, eventDispatcher);
  }, [events, eventDispatcher]);

  const childrenElements = useMemo(() => {
    return renderChildren(childrenIds, components, flatComponents, eventDispatcher, onComponentClick);
  }, [childrenIds, components, flatComponents, eventDispatcher, onComponentClick]);

  if (!Component) {
    console.warn(`Component "${componentName}" not found in registry, rendering as div`);
    return (
      <div {...props} {...eventHandlers} {...restProps} data-fallback-component={componentName}>
        {childrenElements}
      </div>
    );
  }

  const mergedProps = useMemo(() => {
    const p: any = { ...props, ...restProps, ...eventHandlers };

    if (componentValue !== undefined) {
      p.value = componentValue;
    }

    const isContainer = ['Form', 'Page', 'Div', 'Container', 'Card', 'Row', 'Col', 'Layout', 'Header', 'Content', 'Footer', 'Sider'].includes(componentName);

    if (id) {
      if (componentName === 'Form') {
        const originalOnValuesChange = p.onValuesChange;
        p.onValuesChange = (changedValues: any, allValues: any, ...args: any[]) => {
          const newValue = { ...(componentValue || {}), ...allValues };
          dispatch(setComponentData({ id, value: newValue }));

          if (originalOnValuesChange) {
            originalOnValuesChange(changedValues, allValues, ...args);
          }
        };

        if (componentValue !== undefined) {
          p.initialValues = componentValue;
        }
      }
      else if (!isContainer) {
        const originalOnChange = p.onChange;

        p.onChange = (e: any, ...args: any[]) => {
          let value = e;
          if (e && e.target && 'value' in e.target) {
            value = e.target.value;
          } else if (e && e.target && 'checked' in e.target) {
            value = e.target.checked;
          }

          dispatch(setComponentData({ id, value }));

          if (restProps.onChange) {
            restProps.onChange(e, ...args);
          }

          if (originalOnChange && originalOnChange !== restProps.onChange) {
            originalOnChange(e, ...args);
          }
        };
      }
    }

    if (Reflect.has(p, 'initialValue')) {
      Reflect.deleteProperty(p, 'initialValue');
    }

    return p;
  }, [props, restProps, eventHandlers, componentValue, id, dispatch, componentName]);

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

  if (onComponentClick) {
    return (
      <div
        onClick={(e) => {
          e.stopPropagation();
          onComponentClick(node);
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

function renderChildren(
  childrenIds: string[] | undefined,
  components: ComponentRegistry,
  flatComponents: Record<string, A2UIComponent>,
  eventDispatcher?: EventDispatcher,
  onComponentClick?: (node: A2UIComponent) => void,
): React.ReactNode {
  if (!childrenIds || !Array.isArray(childrenIds)) return null;

  return childrenIds.map((childId) => {
    if (typeof childId === 'string' && flatComponents[childId]) {
      return (
        <ComponentRenderer
          key={childId}
          nodeId={childId}
          flatComponents={flatComponents}
          components={components}
          eventDispatcher={eventDispatcher}
          onComponentClick={onComponentClick}
        />
      );
    }
    return null;
  });
}

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

export function Renderer({
  schema,
  components = {},
  onComponentClick,
  eventContext = {}
}: RendererProps): React.ReactElement {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (schema && schema.components) {
      const flattenedData = flattenSchemaValues(schema);
      if (Object.keys(flattenedData).length > 0) {
        dispatch(setMultipleComponentData(flattenedData));
      }
    }
  }, [schema, dispatch]);

  const eventDispatcher = useMemo(() => {
    return new EventDispatcher(eventContext, dispatch, store.getState);
  }, [dispatch]);

  useMemo(() => {
    if (eventContext) {
      Object.entries(eventContext).forEach(([key, value]) => {
        eventDispatcher.setContext(key, value);
      });
    }
  }, [eventContext, eventDispatcher]);

  const allComponents = { ...builtInComponents, ...components };

  if (schema && schema.rootId && schema.components) {
    return (
      <ComponentRenderer
        nodeId={schema.rootId}
        flatComponents={schema.components}
        components={allComponents}
        eventDispatcher={eventDispatcher}
        onComponentClick={onComponentClick}
      />
    );
  }

  return <div style={{ color: 'red' }}>Invalid A2UI Schema: Missing rootId or components</div>;
}

export { builtInComponents };
