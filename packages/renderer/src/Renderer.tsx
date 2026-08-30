/**
 * A2UI 低代码平台渲染器
 * 将 JSON Schema 渲染为 React 组件
 */

import React, { useMemo, useEffect, useRef } from 'react';
import { requireSupportedPageSchema } from '@lowcode-platform/schema-contract';
import type { PageSchema } from '@lowcode-platform/schema-contract';
import type { RendererProps } from './types';
import { flattenSchemaValues } from './utils/schema';
import { EventDispatcher } from './EventDispatcher';
import { ComponentRenderer } from './ComponentRenderer';
import { createComponentRuntimeBridge } from './bridge/createComponentRuntimeBridge';
import { ComponentRuntimeBridgeContext } from './bridge/ComponentRuntimeBridgeContext';
import { sanitizePropsByManifest } from './preset/sanitizePropsByManifest';
import { createRuntimeSession } from './session/RuntimeSession';

/**
 * 主渲染器组件
 */
export function Renderer({
  schema,
  components = {},
  preset,
  pageId,
  documentSessionId,
  onComponentClick,
  eventContext = {},
}: RendererProps): React.ReactElement {
  // Contract 边界（fail-close）：渲染入口只接受 Contract 校验通过的 canonical Schema；
  // 不支持的 schemaVersion、getter、畸形结构在此直接抛错，绝不进入渲染树。
  const canonicalSchema: PageSchema | null = useMemo(
    () => (schema ? structuredClone(requireSupportedPageSchema(schema)) : null),
    [schema],
  );

  const lastRootIdRef = useRef<string | null>(canonicalSchema?.rootId ?? null);

  const flattenedData = useMemo(() => {
    if (!canonicalSchema?.components) {
      return {};
    }
    return flattenSchemaValues(canonicalSchema);
  }, [canonicalSchema]);

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

  // 稳定 flatComponents 引用：仅在内容实际变化时更新。
  // 注意：这里必须使用 canonicalSchema（而非原始 schema prop），
  // 否则同引用原地变异可绕过 Contract 边界进入渲染树。
  const flatComponentsRef = useRef<PageSchema['components'] | undefined>(
    canonicalSchema?.components,
  );
  const stableFlatComponents = useMemo(() => {
    const next = canonicalSchema?.components;
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
  }, [canonicalSchema?.components]);

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
      const nextRootId = canonicalSchema?.rootId ?? null;
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
  }, [
    eventDispatcher,
    eventContextData,
    flattenedData,
    runtimeInitialData,
    canonicalSchema?.rootId,
  ]);

  useEffect(() => {
    if (stableFlatComponents && eventDispatcher) {
      eventDispatcher.setContext('components', stableFlatComponents);
    }
  }, [stableFlatComponents, eventDispatcher]);

  // M0-4 Scope B：单一 Preset 提供基础组件注册表，宿主 components 可覆盖。
  const allComponents = useMemo(
    () => ({ ...(preset?.runtime ?? {}), ...components }),
    [preset, components],
  );

  // Manifest 净化只作用于 Preset 自身组件：宿主覆盖后的类型不再受
  // Preset Manifest 约束（宿主组件有自己的 Props 契约）。
  const presetOwnedTypes = useMemo(() => {
    if (!preset) return null;
    const owned = new Set<string>();
    for (const [type, component] of Object.entries(preset.runtime)) {
      if (components[type] === undefined || components[type] === component) {
        owned.add(type);
      }
    }
    return owned;
  }, [preset, components]);

  const manifestSanitizer = useMemo(() => {
    if (!preset || !presetOwnedTypes) return undefined;
    return (componentType: string, props: Record<string, unknown>): Record<string, unknown> => {
      if (!presetOwnedTypes.has(componentType)) {
        return props;
      }
      const { props: cleaned, rejected } = sanitizePropsByManifest(componentType, props, preset);
      if (rejected.length > 0) {
        console.warn(
          `[Renderer] Preset "${preset.id}" rejected props for "${componentType}": ${rejected.join(', ')}`,
        );
      }
      return cleaned;
    };
  }, [preset, presetOwnedTypes]);

  // M0-4 Scope C：组件（Table 等）通过桥消费受控运行时能力，
  // 不再反向导入执行器内部实现。
  const runtimeBridge = useMemo(
    () => createComponentRuntimeBridge(eventDispatcher),
    [eventDispatcher],
  );

  // M0-4 Scope D：提供 pageId + documentSessionId 时，每次挂载创建独立
  // RuntimeSession；documentSessionId 变化或卸载时销毁旧 Session。
  const session = useMemo(() => {
    if (!pageId || !documentSessionId) return null;
    return createRuntimeSession({ pageId, documentSessionId, dispatcher: eventDispatcher });
  }, [pageId, documentSessionId, eventDispatcher]);

  useEffect(() => {
    if (!session) return;
    session.dispatcher.setContext('session', session);
    return () => {
      session.dispose();
    };
  }, [session]);

  if (canonicalSchema && canonicalSchema.rootId && stableFlatComponents) {
    return (
      <ComponentRuntimeBridgeContext.Provider value={runtimeBridge}>
        <ComponentRenderer
          nodeId={canonicalSchema.rootId}
          flatComponents={stableFlatComponents}
          components={allComponents}
          manifestSanitizer={manifestSanitizer}
          eventDispatcher={eventDispatcher}
          onComponentClick={onComponentClick}
        />
      </ComponentRuntimeBridgeContext.Provider>
    );
  }

  return <div style={{ color: 'red' }}>Invalid A2UI Schema: Missing rootId or components</div>;
}
