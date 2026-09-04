/**
 * A2UI 低代码平台渲染器
 * 将 JSON Schema 渲染为 React 组件
 */

import React, { useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import {
  analyzeActionFlowDeclarations,
  analyzeComputedDeclarations,
  requireSupportedPageSchema,
  SchemaValidationError,
} from '@lowcode-platform/schema-contract';
import type { PageSchema } from '@lowcode-platform/schema-contract';
import type { RendererProps } from './types';
import { flattenSchemaValues } from './utils/schema';
import { ComponentRenderer } from './ComponentRenderer';
import { createComponentRuntimeBridge } from './bridge/createComponentRuntimeBridge';
import { ComponentRuntimeBridgeContext } from './bridge/ComponentRuntimeBridgeContext';
import { sanitizePropsByManifest } from './preset/sanitizePropsByManifest';
import { createRuntimeSession } from './session/RuntimeSession';
import { normalizeHostCapabilities } from './host/HostCapabilities';

/**
 * 主渲染器组件（Issue #19 / M0-4 Scope A/B/D/E）
 */
export function Renderer({
  schema,
  preset,
  pageId,
  documentSessionId,
  hostCapabilities: hostCapabilitiesProp,
  onComponentClick,
  eventContext = {},
}: RendererProps): React.ReactElement {
  // 必须参数前置断言（fail-close）
  if (!preset) {
    throw new Error('[Renderer] Missing required prop "preset" (fail-close)');
  }
  if (typeof pageId !== 'string' || pageId.length === 0) {
    throw new Error('[Renderer] Missing or invalid required prop "pageId" (fail-close)');
  }
  if (typeof documentSessionId !== 'string' || documentSessionId.length === 0) {
    throw new Error('[Renderer] Missing or invalid required prop "documentSessionId" (fail-close)');
  }

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

  const declaredInitialState = useMemo(
    () =>
      canonicalSchema?.logic?.states
        ? (structuredClone(canonicalSchema.logic.states) as Record<string, unknown>)
        : undefined,
    [canonicalSchema?.logic?.states],
  );
  const hasDeclaredState = canonicalSchema?.logic?.states !== undefined;
  const computedAnalysis = useMemo(() => {
    if (canonicalSchema?.logic?.computed === undefined) return undefined;
    const result = analyzeComputedDeclarations(canonicalSchema.logic);
    if (!result.ok) throw new SchemaValidationError(result.issues);
    return result.value;
  }, [canonicalSchema]);

  const flowAnalysis = useMemo(() => {
    if (canonicalSchema?.logic?.flows === undefined) return undefined;
    const result = analyzeActionFlowDeclarations(
      canonicalSchema.logic.flows,
      undefined,
      ['logic', 'flows'],
      {
        allowLegacyNestedStateTargets: canonicalSchema?.logic?.states === undefined,
      },
    );
    if (!result.ok) throw new SchemaValidationError(result.issues);
    return result.value;
  }, [canonicalSchema]);

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

  // M0-4 Scope D：每次 pageId + documentSessionId 身份组合变化或初始挂载时，
  // 创建全新的 RuntimeSession（独立持有 Dispatcher、ReactiveRuntime、AbortSignal 与 timers）。
  const session = useMemo(() => {
    return createRuntimeSession({
      pageId,
      documentSessionId,
      computedAnalysis,
      flowAnalysis,
      dispatcherInit: {
        ...eventContext,
        data: runtimeInitialData,
        // 声明式 State 是新 Session 的权威初始值；无声明时保留旧宿主上下文行为。
        state: hasDeclaredState ? declaredInitialState : eventContext.state,
        components: stableFlatComponents,
      },
    });
  }, [pageId, documentSessionId]);

  // 身份切换或组件卸载时，严格销毁旧 Session（abort signal、clear timers、cleanups）
  useEffect(() => {
    return () => {
      session.dispose();
    };
  }, [session]);

  // 同一文档 Session 的 Schema 热更新只替换 Computed 图与 ActionFlow 定义，不重置运行中 State。
  useLayoutEffect(() => {
    session.configureComputed(computedAnalysis);
  }, [computedAnalysis, session]);

  useLayoutEffect(() => {
    session.configureFlows(flowAnalysis);
  }, [flowAnalysis, session]);

  // M0-4 Scope E：宿主能力显式授予，默认全 deny；注入后运行时不可变。
  const hostCapabilities = useMemo(
    () => normalizeHostCapabilities(hostCapabilitiesProp),
    [hostCapabilitiesProp],
  );

  useEffect(() => {
    session.dispatcher.setHostConfig('hostCapabilities', hostCapabilities);
    session.dispatcher.setHostConfig('session', session);
  }, [session, hostCapabilities]);

  // 在同一个 Session 生命周期内同步上下文变更
  useEffect(() => {
    if (eventContext && session.dispatcher) {
      Object.entries(eventContext).forEach(([key, value]) => {
        if (
          key === 'data' ||
          key === 'components' ||
          key === 'computed' ||
          (key === 'state' && hasDeclaredState)
        ) {
          return;
        }
        session.dispatcher.setContext(key, value);
      });
    }
  }, [eventContext, hasDeclaredState, session.dispatcher]);

  useEffect(() => {
    if (session.dispatcher) {
      const nextRootId = canonicalSchema?.rootId ?? null;
      const rootChanged = lastRootIdRef.current !== nextRootId;

      if (rootChanged) {
        session.dispatcher.setContext('data', runtimeInitialData);
        lastRootIdRef.current = nextRootId;
        return;
      }

      const currentData = session.dispatcher.getExecutionContext().data ?? {};
      const mergedData = {
        ...flattenedData,
        ...currentData,
        ...eventContextData,
      };

      session.dispatcher.setContext('data', mergedData);
    }
  }, [
    session.dispatcher,
    eventContextData,
    flattenedData,
    runtimeInitialData,
    canonicalSchema?.rootId,
  ]);

  useEffect(() => {
    if (stableFlatComponents && session.dispatcher) {
      session.dispatcher.setContext('components', stableFlatComponents);
    }
  }, [stableFlatComponents, session.dispatcher]);

  // M0-4 Scope B：所有组件由封闭 Preset 提供，Manifest 净化作用于所有渲染组件
  const manifestSanitizer = useMemo(() => {
    return (componentType: string, props: Record<string, unknown>): Record<string, unknown> => {
      const { props: cleaned, rejected } = sanitizePropsByManifest(componentType, props, preset);
      if (rejected.length > 0) {
        console.warn(
          `[Renderer] Preset "${preset.id}" rejected props for "${componentType}": ${rejected.join(', ')}`,
        );
      }
      return cleaned;
    };
  }, [preset]);

  // M0-4 Scope C：组件（Table 等）通过桥消费受控运行时能力
  const runtimeBridge = useMemo(
    () => createComponentRuntimeBridge(session.dispatcher),
    [session.dispatcher],
  );

  if (canonicalSchema && canonicalSchema.rootId && stableFlatComponents) {
    return (
      <ComponentRuntimeBridgeContext.Provider value={runtimeBridge}>
        <ComponentRenderer
          key={`${pageId}:${documentSessionId}`}
          nodeId={canonicalSchema.rootId}
          flatComponents={stableFlatComponents}
          components={preset.runtime}
          manifestSanitizer={manifestSanitizer}
          eventDispatcher={session.dispatcher}
          onComponentClick={onComponentClick}
        />
      </ComponentRuntimeBridgeContext.Provider>
    );
  }

  return <div style={{ color: 'red' }}>Invalid A2UI Schema: Missing rootId or components</div>;
}
