/**
 * 组件渲染器
 * 负责单个组件的渲染逻辑
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useMemo, useRef, memo, useSyncExternalStore } from 'react';
import { useAppSelector } from './store/hooks';
import type { ComponentRegistry, A2UIComponent } from './types';
import type { EventDispatcher } from './EventDispatcher';
import { builtInComponents } from './builtInComponents';
import { resolveValues } from './executor/parser/valueResolver';
import { analyzeComponentDeps, setsOverlap } from './reactive/dependencyAnalyzer';
import { getFlag } from './featureFlags';
import {
  BaseComponent,
  FormSyncWrapper,
  buildEventHandlers,
  buildFallbackClassName,
  CONTAINER_COMPONENTS,
  INPUT_LEAF_COMPONENTS,
  resolveVisibilityProps,
} from './ComponentRenderer.helpers';

// 模块级常量：保证 useSyncExternalStore 的 subscribe/getSnapshot 引用稳定
const noopSubscribe = () => () => {};
const noopGetVersion = () => 0;

/**
 * 组件渲染器 Props
 */
export interface ComponentRendererProps {
  nodeId: string;
  flatComponents: Record<string, A2UIComponent>;
  components: ComponentRegistry;
  eventDispatcher?: EventDispatcher;
  onComponentClick?: (node: A2UIComponent) => void;
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

    const storeComponentValue = useAppSelector((state) =>
      id ? state.components.data[id] : undefined,
    );
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
    const componentValue =
      storeComponentValue !== undefined ? storeComponentValue : schemaInitialValue;

    // 启用条件：reactiveContext 或 useReactiveRuntime 任一为 true
    const reactiveEnabled = getFlag('reactiveContext') || getFlag('useReactiveRuntime');
    const contextVersion = useSyncExternalStore(
      reactiveEnabled ? (eventDispatcher?.subscribe ?? noopSubscribe) : noopSubscribe,
      reactiveEnabled ? (eventDispatcher?.getVersion ?? noopGetVersion) : noopGetVersion,
    );

    const Component = componentName
      ? components[componentName] || builtInComponents[componentName]
      : undefined;

    const eventHandlers = useMemo(() => {
      return buildEventHandlers(events, eventDispatcher);
    }, [events, eventDispatcher]);

    const deps = useMemo(() => analyzeComponentDeps(props as Record<string, any>), [props]);
    const prevResolvedRef = useRef<Record<string, any> | null>(null);
    const lastConsumedVersionRef = useRef(0);

    const resolvedSchemaProps = useMemo(() => {
      if (!eventDispatcher) {
        return props;
      }

      if (
        getFlag('selectiveEvaluation') &&
        getFlag('reactiveContext') &&
        prevResolvedRef.current !== null
      ) {
        const changed = eventDispatcher.getChangedKeysForVersion(lastConsumedVersionRef.current);
        if (
          changed !== 'all' &&
          !deps.hasDynamicDeps &&
          changed.size > 0 &&
          !setsOverlap(changed, deps.dataDeps)
        ) {
          lastConsumedVersionRef.current = contextVersion;
          return prevResolvedRef.current;
        }
      }

      try {
        const result = resolveValues(
          props as Record<string, any>,
          eventDispatcher.getExecutionContext(),
        );
        prevResolvedRef.current = result;
        lastConsumedVersionRef.current = contextVersion;
        return result;
      } catch (error) {
        console.warn('[Renderer] Failed to resolve props expressions', { id, error });
        return props;
      }
    }, [props, eventDispatcher, id, contextVersion, deps]);

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
              eventDispatcher={eventDispatcher}
              onComponentClick={onComponentClick}
              ancestors={ancestors}
            />
          );
        }
        return null;
      });
    }, [childrenIds, components, flatComponents, eventDispatcher, onComponentClick, ancestors]);

    const mergedProps = useMemo(() => {
      const p: any = { ...sanitizedProps, ...restProps, ...eventHandlers };

      if (componentValue !== undefined) {
        p.value = componentValue;
      }

      const isContainer = CONTAINER_COMPONENTS.has(componentName);

      if (id) {
        if (componentName === 'Form') {
          const originalOnValuesChange = p.onValuesChange;
          p.onValuesChange = (changedValues: any, allValues: any, ...args: any[]) => {
            const newValue = { ...(componentValue || {}), ...allValues };

            // Phase 2: 单一写路径 - 通过 EventDispatcher -> ReactiveRuntime
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

            // Phase 2: 单一写路径 - 通过 EventDispatcher -> ReactiveRuntime
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
      const fallbackMarkedClassName = buildFallbackClassName(
        sanitizedProps?.className as string | undefined,
        restProps.className,
        id,
        Boolean(onComponentClick),
      );
      return (
        <div
          {...sanitizedProps}
          {...eventHandlers}
          {...restProps}
          data-fallback-component={componentName}
          className={fallbackMarkedClassName}
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
