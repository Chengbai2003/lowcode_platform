/**
 * A2UI 低代码平台渲染器
 * 将 JSON Schema 渲染为 React 组件
 */

import React, { useMemo, useEffect, useRef } from 'react';
import type { RendererProps } from './types';
import { flattenSchemaValues } from './utils/schema';
import { EventDispatcher } from './EventDispatcher';
import { builtInComponents } from './builtInComponents';
import { ComponentRenderer } from './ComponentRenderer';

/**
 * 主渲染器组件
 */
export function Renderer({
  schema,
  components = {},
  onComponentClick,
  eventContext = {},
}: RendererProps): React.ReactElement {
  const lastRootIdRef = useRef<string | null>(schema?.rootId ?? null);

  const flattenedData = useMemo(() => {
    if (!schema?.components) {
      return {};
    }
    return flattenSchemaValues(schema);
  }, [schema]);

  const eventContextData = useMemo(() => {
    if (!eventContext.data || typeof eventContext.data !== 'object') {
      return {};
    }
    return eventContext.data as Record<string, unknown>;
  }, [eventContext]);

  const runtimeInitialData = useMemo(
    () => ({ ...flattenedData, ...eventContextData }),
    [flattenedData, eventContextData],
  );

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
    return new EventDispatcher(
      {
        ...eventContext,
        data: runtimeInitialData,
        components: stableFlatComponents,
      },
      eventContext.dispatch,
      eventContext.getState,
    );
  }, [eventContext.dispatch, eventContext.getState]); // eventContext变化会在下面的useEffect中处理

  useEffect(() => {
    if (eventContext && eventDispatcher) {
      Object.entries(eventContext).forEach(([key, value]) => {
        if (key === 'data' || key === 'components') {
          return;
        }
        eventDispatcher.setContext(key, value);
      });
    }
  }, [eventContext, eventDispatcher]);

  useEffect(() => {
    if (eventDispatcher) {
      const nextRootId = schema?.rootId ?? null;
      const rootChanged = lastRootIdRef.current !== nextRootId;

      if (rootChanged) {
        eventDispatcher.setContext('data', runtimeInitialData);
        lastRootIdRef.current = nextRootId;
        return;
      }

      const currentData = eventDispatcher.getExecutionContext().data ?? {};
      const mergedData = {
        ...flattenedData,
        ...currentData,
        ...eventContextData,
      };

      eventDispatcher.setContext('data', mergedData);
    }
  }, [eventDispatcher, eventContextData, flattenedData, runtimeInitialData, schema?.rootId]);

  useEffect(() => {
    if (stableFlatComponents && eventDispatcher) {
      eventDispatcher.setContext('components', stableFlatComponents);
    }
  }, [stableFlatComponents, eventDispatcher]);

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

// 导出
export { EventDispatcher } from './EventDispatcher';
export { builtInComponents } from './builtInComponents';
export { ComponentRenderer } from './ComponentRenderer';
