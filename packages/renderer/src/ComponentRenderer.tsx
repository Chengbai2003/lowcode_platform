/**
 * 组件渲染器
 * 负责单个组件的渲染逻辑
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, memo } from 'react';
import type { ComponentRegistry, ComponentNode } from './types';
import type { EventDispatcher } from './EventDispatcher';
import { useNodeValue, useResolvedSchemaProps } from './ComponentRenderer.runtime';
import { analyzeComponentDeps } from './reactive/dependencyAnalyzer';
import {
  BaseComponent,
  FormSyncWrapper,
  buildEventHandlers,
  buildFallbackClassName,
  CONTAINER_COMPONENTS,
  INPUT_LEAF_COMPONENTS,
  resolveVisibilityProps,
} from './ComponentRenderer.helpers';

/**
 * 组件渲染器 Props
 */
export interface ComponentRendererProps {
  nodeId: string;
  flatComponents: Record<string, ComponentNode>;
  components: ComponentRegistry;
  /**
   * Preset Manifest Props 净化器（M0-4 Scope B）：仅对 Preset 自身组件生效。
   * 由 Renderer 构建并下发；无 Preset 时为 undefined。
   */
  manifestSanitizer?: (
    componentType: string,
    props: Record<string, unknown>,
  ) => Record<string, unknown>;
  eventDispatcher?: EventDispatcher;
  onComponentClick?: (node: ComponentNode) => void;
  ancestors?: Set<string>;
  [key: string]: any;
}

/**
 * 组件渲染器
 * 负责渲染单个组件及其子组件
 */
export const ComponentRenderer = memo(
  ({
    onComponentClick,
    components,
    manifestSanitizer,
    eventDispatcher,
    nodeId,
    flatComponents,
    ancestors: parentAncestors,
    ...restProps
  }: ComponentRendererProps) => {
    const node = flatComponents[nodeId];
    const componentName = node?.type;
    const props = node?.props ?? {};
    const childrenIds = node?.childrenIds;
    const events = node?.events ?? {};
    const id = node?.id;

    const ancestors = useMemo(() => {
      const set = new Set(parentAncestors);
      if (nodeId) set.add(nodeId);
      return set;
    }, [parentAncestors, nodeId]);

    const schemaInitialValue = useMemo(() => {
      if (!id) {
        return undefined;
      }

      if (props.initialValue !== undefined) {
        return props.initialValue;
      }

      if (componentName === 'Form' && props.initialValues !== undefined) {
        return props.initialValues;
      }

      if (props.value !== undefined) {
        return props.value;
      }

      if (props.defaultValue !== undefined) {
        return props.defaultValue;
      }

      return undefined;
    }, [componentName, id, props]);
    const componentValue = useNodeValue(id, schemaInitialValue, eventDispatcher);

    const Component = componentName ? components[componentName] : undefined;

    const eventHandlers = useMemo(() => {
      return buildEventHandlers(events, eventDispatcher);
    }, [events, eventDispatcher]);

    const deps = useMemo(() => analyzeComponentDeps(props as Record<string, any>), [props]);
    const resolvedSchemaProps = useResolvedSchemaProps(
      nodeId,
      id,
      props as Record<string, any>,
      eventDispatcher,
      deps,
    );

    const { isVisible, sanitizedProps } = useMemo(
      () => resolveVisibilityProps(resolvedSchemaProps),
      [resolvedSchemaProps],
    );

    const childrenElements = useMemo(() => {
      if (!childrenIds || !Array.isArray(childrenIds)) return null;

      return childrenIds.map((childId) => {
        if (typeof childId === 'string' && flatComponents[childId]) {
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
              manifestSanitizer={manifestSanitizer}
              eventDispatcher={eventDispatcher}
              onComponentClick={onComponentClick}
              ancestors={ancestors}
            />
          );
        }
        return null;
      });
    }, [
      childrenIds,
      components,
      flatComponents,
      manifestSanitizer,
      eventDispatcher,
      onComponentClick,
      ancestors,
    ]);

    const mergedProps = useMemo(() => {
      // M0-4 Scope B：Preset Manifest 校验与净化先于任何 Props 合并执行
      const manifestCleanedProps = manifestSanitizer
        ? manifestSanitizer(componentName as string, sanitizedProps)
        : sanitizedProps;
      const p: any = { ...manifestCleanedProps, ...restProps, ...eventHandlers };

      if (componentValue !== undefined) {
        p.value = componentValue;
      }

      const isContainer = CONTAINER_COMPONENTS.has(componentName);

      if (id) {
        if (componentName === 'Form') {
          const originalOnValuesChange = p.onValuesChange;
          p.onValuesChange = (changedValues: any, allValues: any, ...args: any[]) => {
            const newValue = { ...(componentValue || {}), ...allValues };

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

      // M0-4 Scope C：Table 通过 ComponentRuntimeBridgeContext 获取受控能力，
      // 这里只保留纯字符串的组件标识（无执行器对象经 props 外泄）。
      if (componentName === 'Table') {
        p.__componentId = id;
      }

      return p;
    }, [
      sanitizedProps,
      manifestSanitizer,
      restProps,
      eventHandlers,
      componentValue,
      id,
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
      // M0-4 Scope B：未知组件 fail-close——不把 Props 传给任何实现，
      // 只渲染显式错误占位（保持子树可导航，便于在编辑器中定位）。
      console.warn(`[Renderer] Unknown component type "${componentName}" — refused (fail-close)`);
      const fallbackMarkedClassName = buildFallbackClassName(
        sanitizedProps?.className as string | undefined,
        restProps.className,
        id,
        Boolean(onComponentClick),
      );
      return (
        <div
          data-unknown-component={componentName}
          data-fallback-component={componentName}
          className={fallbackMarkedClassName}
          style={{ color: '#d4380d', border: '1px dashed #ffa39e', padding: 8 }}
          {...(onComponentClick && id ? { 'data-component-id': id } : {})}
        >
          {childrenElements}
        </div>
      );
    }

    const finalChildrenElements = INPUT_LEAF_COMPONENTS.has(componentName)
      ? null
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
