/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useMemo, useEffect, useRef, memo } from 'react';
import type { RendererProps, ComponentRegistry, A2UIComponent } from './types';
import { useAppDispatch, useAppSelector } from './store/hooks';
import {
  setComponentData,
  setComponentConfig,
  setMultipleComponentData,
} from './store/componentSlice';
import { store } from './store';
import { flattenSchemaValues } from './utils/schema';
import { resolveValues } from './executor/parser/valueResolver';
import { deepEqual } from './utils/compare';
import { shallowEqual } from 'react-redux';
import { DSLExecutor } from './executor';
import type { ActionList, ExecutionContext } from '../types';
import {
  Text as TypographyText,
  Title as TypographyTitle,
  Paragraph as TypographyParagraph,
} from '../components/components/Typography';

/**
 * 事件派发中心
 * 负责解析和执行 DSL Action 序列
 */

export class EventDispatcher {
  private context: Record<string, any>;

  private dispatch: any;

  private getState: any;
  private dslExecutor: DSLExecutor;
  private executionContext: ExecutionContext;

  constructor(
    context: Record<string, any> = {},

    dispatch: any,

    getState: any,
  ) {
    this.context = context;
    this.dispatch = dispatch;
    this.getState = getState;

    // 创建DSL执行引擎
    this.dslExecutor = new DSLExecutor({
      debug: process.env.NODE_ENV !== 'production',
      onError: (error, action) => {
        console.error('[DSL Error]', error.message, { action });
      },
      onLog: (level, message, data) => {
        (console as any)[level](`[DSL ${level}]`, message, data);
      },
    });

    // 创建执行上下文
    this.executionContext = DSLExecutor.createContext({
      dispatch: this.dispatch,
      getState: this.getState,
      data: {}, // 组件数据
      formData: {}, // 表单数据
      setComponentData: (id: string, value: any) => {
        this.dispatch(setComponentData({ id, value }));
      },
      setComponentConfig: (id: string, config: any) => {
        this.dispatch(setComponentConfig({ id, config }));
      },
      ...this.context,
    });
  }

  /**
   * 更新执行上下文（不可变更新）
   */
  setContext(key: string, value: any) {
    this.context = { ...this.context, [key]: value };
    this.executionContext = { ...this.executionContext, [key]: value };
  }

  /**
   * 更新组件数据到执行上下文（不可变更新）
   */
  updateComponentData(componentId: string, value: any) {
    const currentData = (this.executionContext as any).data || {};
    this.executionContext = {
      ...this.executionContext,
      data: { ...currentData, [componentId]: value },
    };
  }

  /**
   * 执行 DSL Action 序列
   */
  async execute(actions: ActionList, event?: Event | any): Promise<any> {
    try {
      // 将事件对象添加到上下文
      const contextWithEvent: ExecutionContext = {
        ...this.executionContext,
        event,
      };

      // 执行DSL
      const result = await this.dslExecutor.execute(actions, contextWithEvent);
      return result;
    } catch (error) {
      console.error('[EventDispatcher] DSL execution failed:', error);
      throw error;
    }
  }

  /**
   * 创建事件处理器（同步版本，用于React事件绑定）
   */
  createHandler(actions: ActionList) {
    return (event: any) => {
      // 异步执行，不等待结果
      this.execute(actions, event).catch((error) => {
        console.error('[EventDispatcher] Handler execution failed:', error);
      });
    };
  }

  /**
   * 获取DSL执行引擎实例
   */
  getExecutor(): DSLExecutor {
    return this.dslExecutor;
  }

  /**
   * 获取当前执行上下文
   */
  getExecutionContext(): ExecutionContext {
    return this.executionContext;
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
    <div style={{ ...style, padding: '16px' }} {...props}>
      {children}
    </div>
  ),
  Row: ({ children, style, ...props }: any) => (
    <div style={{ ...style, display: 'flex', flexDirection: 'row' }} {...props}>
      {children}
    </div>
  ),
  Col: ({ children, style, ...props }: any) => (
    <div style={{ ...style, flex: 1 }} {...props}>
      {children}
    </div>
  ),
  Text: ({ children, ...props }: any) => <TypographyText {...props}>{children}</TypographyText>,
  Title: ({ children, level = 1, ...props }: any) => (
    <TypographyTitle level={level} {...props}>
      {children}
    </TypographyTitle>
  ),
  Paragraph: ({ children, ...props }: any) => (
    <TypographyParagraph {...props}>{children}</TypographyParagraph>
  ),
  Input: (props: any) => <input {...props} />,
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  TextArea: (props: any) => <textarea {...props} />,
  Image: ({ src, alt, ...props }: any) => <img src={src} alt={alt} {...props} />,
  Link: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
};

const FormSyncWrapper = ({
  Component,
  mergedProps,
  childrenElements,
  id,
  componentValue,
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

const BaseComponent = memo(
  ({
    Component,
    mergedProps,
    childrenElements,
    id,
  }: {
    Component: React.ComponentType<any>;
    mergedProps: any;
    childrenElements: React.ReactNode;
    id?: string;
  }) => {
    // 合并 props.children 和 childrenElements
    // 场景 1: childrenElements 有值（从 childrenIds 渲染）→ 优先使用
    // 场景 2: childrenElements 为空，但 props.children 有值 → 使用 props.children
    // 场景 3: 两者都有 → 合并（例如 Button 既有文本又有 Icon）
    const propsChildren = mergedProps.children;

    let finalChildren: React.ReactNode;
    if (childrenElements) {
      // childrenElements 有值（子组件数组或单个子组件）
      if (propsChildren != null && propsChildren !== '') {
        // 如果 props.children 也有值，合并两者
        finalChildren = (
          <>
            {propsChildren}
            {childrenElements}
          </>
        );
      } else {
        finalChildren = childrenElements;
      }
    } else {
      // childrenElements 为空，使用 props.children
      finalChildren = propsChildren;
    }

    return (
      <Component {...mergedProps} id={id}>
        {finalChildren}
      </Component>
    );
  },
  (prevProps, nextProps) => {
    if (prevProps.Component !== nextProps.Component) return false;
    if (prevProps.id !== nextProps.id) return false;
    if (prevProps.childrenElements !== nextProps.childrenElements) return false;
    if (!shallowEqual(prevProps.mergedProps, nextProps.mergedProps)) return false;
    return true;
  },
);

const ComponentRenderer = memo(
  ({
    onComponentClick,
    components,
    eventDispatcher,
    nodeId,
    flatComponents,
    ancestors: parentAncestors,
    ...restProps
  }: {
    nodeId: string;
    flatComponents: Record<string, A2UIComponent>;
    components: ComponentRegistry;
    eventDispatcher?: EventDispatcher;
    onComponentClick?: (node: A2UIComponent) => void;
    ancestors?: Set<string>;
    [key: string]: any;
  }) => {
    const node = flatComponents[nodeId];
    const componentName = node?.type;
    const props = node?.props ?? {};
    const childrenIds = node?.childrenIds;
    const events = node?.events ?? {};
    const id = node?.id;

    // 构建包含当前节点的祖先集合，传递给子节点用于循环检测
    const ancestors = useMemo(() => {
      const set = new Set(parentAncestors);
      if (nodeId) set.add(nodeId);
      return set;
    }, [parentAncestors, nodeId]);

    const dispatch = useAppDispatch();
    const componentValue = useAppSelector((state) => (id ? state.components.data[id] : undefined));

    const Component = componentName
      ? components[componentName] || builtInComponents[componentName]
      : undefined;

    const eventHandlers = useMemo(() => {
      return buildEventHandlers(events, eventDispatcher);
    }, [events, eventDispatcher]);

    const resolvedSchemaProps = useMemo(() => {
      if (!eventDispatcher) {
        return props;
      }
      try {
        return resolveValues(props as Record<string, any>, eventDispatcher.getExecutionContext());
      } catch (error) {
        console.warn('[Renderer] Failed to resolve props expressions', { id, error });
        return props;
      }
    }, [props, eventDispatcher, id]);

    const hasVisibleProp =
      resolvedSchemaProps && Object.prototype.hasOwnProperty.call(resolvedSchemaProps, 'visible');
    const isVisible = !hasVisibleProp || Boolean((resolvedSchemaProps as any).visible);

    const sanitizedProps = useMemo(() => {
      if (!hasVisibleProp) {
        return resolvedSchemaProps;
      }
      const { visible, ...rest } = resolvedSchemaProps as Record<string, unknown>;
      return rest;
    }, [hasVisibleProp, resolvedSchemaProps]);

    const childrenElements = useMemo(() => {
      return renderChildren(
        childrenIds,
        components,
        flatComponents,
        eventDispatcher,
        onComponentClick,
        ancestors,
      );
    }, [childrenIds, components, flatComponents, eventDispatcher, onComponentClick, ancestors]);

    const mergedProps = useMemo(() => {
      const p: any = { ...sanitizedProps, ...restProps, ...eventHandlers };

      if (componentValue !== undefined) {
        p.value = componentValue;
      }

      const isContainer = [
        'Form',
        'Page',
        'Div',
        'Container',
        'Card',
        'Row',
        'Col',
        'Layout',
        'Header',
        'Content',
        'Footer',
        'Sider',
      ].includes(componentName);

      if (id) {
        if (componentName === 'Form') {
          const originalOnValuesChange = p.onValuesChange;
          p.onValuesChange = (changedValues: any, allValues: any, ...args: any[]) => {
            const newValue = { ...(componentValue || {}), ...allValues };
            dispatch(setComponentData({ id, value: newValue }));

            // 更新到EventDispatcher的执行上下文
            if (eventDispatcher) {
              eventDispatcher.updateComponentData(id, newValue);
            }

            if (originalOnValuesChange) {
              originalOnValuesChange(changedValues, allValues, ...args);
            }
          };

          if (componentValue !== undefined) {
            p.initialValues = componentValue;
          }
        } else if (!isContainer) {
          const originalOnChange = p.onChange;

          p.onChange = (e: any, ...args: any[]) => {
            let value = e;
            if (e && e.target && 'value' in e.target) {
              value = e.target.value;
            } else if (e && e.target && 'checked' in e.target) {
              value = e.target.checked;
            }

            dispatch(setComponentData({ id, value }));

            // 更新到EventDispatcher的执行上下文
            if (eventDispatcher) {
              eventDispatcher.updateComponentData(id, value);
            }

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

      if (onComponentClick && id) {
        p['data-component-id'] = id;
        p.className = [p.className, 'lowcode-component-wrapper', `lowcode-component-id-${id}`]
          .filter(Boolean)
          .join(' ');
      }

      return p;
    }, [
      sanitizedProps,
      restProps,
      eventHandlers,
      componentValue,
      id,
      dispatch,
      componentName,
      eventDispatcher,
      onComponentClick,
    ]);

    if (!node || !componentName) {
      return null;
    }

    if (!isVisible) {
      return null;
    }

    if (!Component) {
      console.warn(`Component "${componentName}" not found in registry, rendering as div`);
      const fallbackClassName = [sanitizedProps?.className, restProps.className]
        .filter(Boolean)
        .join(' ');
      const fallbackMarkedClassName =
        onComponentClick && id
          ? [fallbackClassName, 'lowcode-component-wrapper', `lowcode-component-id-${id}`]
              .filter(Boolean)
              .join(' ')
          : fallbackClassName;
      return (
        <div
          {...sanitizedProps}
          {...eventHandlers}
          {...restProps}
          data-fallback-component={componentName}
          className={fallbackMarkedClassName}
          {...(onComponentClick && id
            ? {
                'data-component-id': id,
              }
            : {})}
        >
          {childrenElements}
        </div>
      );
    }

    // 判断组件是否是"表单输入类"叶子组件（不支持 children，但可能有 props.children 文本）
    // 注意：Button、Title、Text、Tag 等组件支持 props.children 显示文本
    const isInputLeafComponent = [
      'Input',
      'InputPassword',
      'TextArea',
      'InputNumber',
      'Select',
      'Checkbox',
      'Radio',
      'Switch',
      'Slider',
      'DatePicker',
      'RangePicker',
    ].includes(componentName);

    // 对于表单输入类组件，忽略 childrenIds（它们不支持子组件）
    // 对于容器组件，使用 childrenElements
    // 对于 Button、Title、Text 等组件，优先使用 props.children，但也支持 childrenIds
    const finalChildrenElements = isInputLeafComponent
      ? null // 表单输入组件不支持 children
      : childrenElements;

    const content =
      componentName === 'Form' && (Component as any).useForm ? (
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
          childrenElements={finalChildrenElements}
          id={id}
        />
      );

    return content;
  },
);

function renderChildren(
  childrenIds: string[] | undefined,
  components: ComponentRegistry,
  flatComponents: Record<string, A2UIComponent>,
  eventDispatcher?: EventDispatcher,
  onComponentClick?: (node: A2UIComponent) => void,
  ancestors?: Set<string>,
): React.ReactNode {
  if (!childrenIds || !Array.isArray(childrenIds)) return null;

  return childrenIds.map((childId) => {
    if (typeof childId === 'string' && flatComponents[childId]) {
      // 循环引用检测：如果子节点已在祖先链中，跳过渲染
      if (ancestors?.has(childId)) {
        console.warn(
          `[Renderer] Circular reference detected: ${childId} is already an ancestor. Skipping.`,
        );
        return null;
      }
      return (
        <ComponentRenderer
          key={childId}
          nodeId={childId}
          flatComponents={flatComponents}
          components={components}
          eventDispatcher={eventDispatcher}
          onComponentClick={onComponentClick}
          ancestors={ancestors}
        />
      );
    }
    return null;
  });
}

function buildEventHandlers(
  events: Record<string, ActionList>,
  eventDispatcher?: EventDispatcher,
): Record<string, (...args: any[]) => any> {
  if (!eventDispatcher || Object.keys(events).length === 0) {
    return {};
  }

  const handlers: Record<string, (...args: any[]) => any> = {};

  // 直接以 trigger 为 key，actions 为 value
  for (const [trigger, actions] of Object.entries(events)) {
    if (actions.length > 0) {
      handlers[trigger] = eventDispatcher.createHandler(actions);
    }
  }

  return handlers;
}

export function Renderer({
  schema,
  components = {},
  onComponentClick,
  eventContext = {},
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

  // 稳定 flatComponents 引用：仅在内容实际变化时更新
  const flatComponentsRef = useRef(schema?.components);
  const stableFlatComponents = useMemo(() => {
    const next = schema?.components;
    if (next && flatComponentsRef.current && next !== flatComponentsRef.current) {
      // 浅比较：key 集合相同且每个 value 引用相同则复用旧引用
      const prevKeys = Object.keys(flatComponentsRef.current);
      const nextKeys = Object.keys(next);
      if (
        prevKeys.length === nextKeys.length &&
        nextKeys.every((k) => flatComponentsRef.current![k] === next[k])
      ) {
        return flatComponentsRef.current;
      }
    }
    flatComponentsRef.current = next;
    return next;
  }, [schema?.components]);

  const eventDispatcher = useMemo(() => {
    return new EventDispatcher(eventContext, dispatch, store.getState);
  }, [dispatch]); // eventContext变化会在下面的useEffect中处理

  useEffect(() => {
    if (eventContext && eventDispatcher) {
      Object.entries(eventContext).forEach(([key, value]) => {
        eventDispatcher.setContext(key, value);
      });
    }
  }, [eventContext, eventDispatcher]);

  const allComponents = { ...builtInComponents, ...components };

  if (schema && schema.rootId && stableFlatComponents) {
    return (
      <ComponentRenderer
        nodeId={schema.rootId}
        flatComponents={stableFlatComponents}
        components={allComponents}
        eventDispatcher={eventDispatcher}
        onComponentClick={onComponentClick}
      />
    );
  }

  return <div style={{ color: 'red' }}>Invalid A2UI Schema: Missing rootId or components</div>;
}

export { builtInComponents };
