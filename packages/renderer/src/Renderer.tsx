import React, { useState, useMemo, useEffect, memo } from 'react';
import type { RendererProps, ComponentRegistry, A2UIComponent } from './types';
import { useAppDispatch, useAppSelector } from './store/hooks';
import { setComponentData, setComponentConfig, setMultipleComponentData } from './store/componentSlice';
import { store } from './store';
import { flattenSchemaValues } from './utils/schema';
import { deepEqual } from './utils/compare';
import { shallowEqual } from 'react-redux';
// 导入安全的 EventDispatcher
import { SafeEventDispatcher } from './EventDispatcher';

// 导出安全的 EventDispatcher
export { SafeEventDispatcher as EventDispatcher } from './EventDispatcher';

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
  const [dispatcherReady, setDispatcherReady] = useState(false);

  useEffect(() => {
    if (schema && schema.components) {
      const flattenedData = flattenSchemaValues(schema);
      if (Object.keys(flattenedData).length > 0) {
        dispatch(setMultipleComponentData(flattenedData));
      }
    }
  }, [schema, dispatch]);

  const eventDispatcher = useMemo(() => {
    return new EventDispatcher(dispatch, store.getState);
  }, [dispatch]);

  // 异步初始化事件分发器
  useEffect(() => {
    let mounted = true;

    const initDispatcher = async () => {
      try {
        await eventDispatcher.initialize();
        if (mounted) {
          // 注入自定义上下文
          if (eventContext) {
            Object.entries(eventContext).forEach(([key, value]) => {
              eventDispatcher.setContext(key, value);
            });
          }
          setDispatcherReady(true);
        }
      } catch (error) {
        console.error('Failed to initialize event dispatcher:', error);
      }
    };

    initDispatcher();

    return () => {
      mounted = false;
    };
  }, [eventDispatcher, eventContext]);

  const allComponents = { ...builtInComponents, ...components };

  // 在沙箱准备好之前显示加载状态
  if (!dispatcherReady) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        正在初始化安全沙箱...
      </div>
    );
  }

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
