import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { EventDispatcher } from './EventDispatcher';
import { getFlag } from './featureFlags';
import type { ComponentDeps } from './reactive/dependencyAnalyzer';
import { resolveValues } from './executor/parser/valueResolver';

const noopSubscribe = () => () => {};
const noopGetVersion = () => 0;

function serializeDeps(deps: ReadonlySet<string>): string {
  return Array.from(deps).sort().join('|');
}

function hasAffectedRuntimeDeps(
  dirtyPaths: ReadonlySet<string> | 'all',
  deps: ReadonlySet<string>,
): boolean {
  if (dirtyPaths === 'all') {
    return true;
  }

  if (deps.size === 0) {
    return true;
  }

  for (const dep of deps) {
    if (dirtyPaths.has(dep)) {
      return true;
    }

    for (const dirtyPath of dirtyPaths) {
      if (dep.startsWith(`${dirtyPath}.`) || dep.startsWith(`${dirtyPath}[`)) {
        return true;
      }

      if (dirtyPath.startsWith(`${dep}.`) || dirtyPath.startsWith(`${dep}[`)) {
        return true;
      }
    }
  }

  return false;
}

function readComponentValue(eventDispatcher: EventDispatcher | undefined, id?: string): unknown {
  if (!eventDispatcher || !id) {
    return undefined;
  }

  const runtimeValue = eventDispatcher.getRuntime().get(id);
  if (runtimeValue !== undefined) {
    return runtimeValue;
  }

  return eventDispatcher.getExecutionContext().data?.[id];
}

export function useNodeValue(
  id: string | undefined,
  schemaInitialValue: unknown,
  eventDispatcher: EventDispatcher | undefined,
): unknown {
  const runtime = eventDispatcher?.getRuntime();

  const version = useSyncExternalStore(
    runtime && id
      ? (listener) =>
          runtime.subscribeComputed(`node-value:${id}`, listener, new Set([`data.${id}`]))
      : noopSubscribe,
    runtime ? () => runtime.getVersion() : noopGetVersion,
  );

  return useMemo(() => {
    const value = readComponentValue(eventDispatcher, id);
    return value !== undefined ? value : schemaInitialValue;
  }, [eventDispatcher, id, schemaInitialValue, version]);
}

export function useResolvedSchemaProps(
  nodeId: string,
  id: string | undefined,
  props: Record<string, any>,
  eventDispatcher: EventDispatcher | undefined,
  _deps: ComponentDeps,
): Record<string, any> {
  const runtime = eventDispatcher?.getRuntime();
  const trackedDepsRef = useRef<Set<string>>(new Set());
  const prevResolvedRef = useRef<Record<string, any> | null>(null);
  const prevSourcePropsRef = useRef<Record<string, any> | null>(null);
  const lastConsumedVersionRef = useRef(0);

  const contextVersion = useSyncExternalStore(
    runtime
      ? (listener) =>
          runtime.subscribeComputed(`resolved-props:${nodeId}`, listener, trackedDepsRef.current)
      : noopSubscribe,
    runtime ? () => runtime.getVersion() : noopGetVersion,
  );

  const resolvedSchemaProps = useMemo(() => {
    if (!eventDispatcher) {
      return props;
    }

    if (
      getFlag('selectiveEvaluation') &&
      prevResolvedRef.current !== null &&
      prevSourcePropsRef.current === props
    ) {
      const changed = runtime?.getDirtyPaths(lastConsumedVersionRef.current) ?? 'all';
      if (!hasAffectedRuntimeDeps(changed, trackedDepsRef.current)) {
        lastConsumedVersionRef.current = contextVersion;
        return prevResolvedRef.current;
      }
    }

    try {
      runtime?.startTracking();

      const result = resolveValues(props, eventDispatcher.getExecutionContext());
      if (runtime) {
        trackedDepsRef.current = runtime.stopTracking();
      }

      prevResolvedRef.current = result;
      prevSourcePropsRef.current = props;
      lastConsumedVersionRef.current = contextVersion;
      return result;
    } catch (error) {
      if (runtime?.isTrackingActive()) {
        runtime.stopTracking();
      }

      console.warn('[Renderer] Failed to resolve props expressions', {
        id,
        nodeId,
        error,
      });
      prevSourcePropsRef.current = props;
      return props;
    }
  }, [contextVersion, eventDispatcher, id, nodeId, props, runtime]);

  const trackedDepsKey = useMemo(
    () => serializeDeps(trackedDepsRef.current),
    [resolvedSchemaProps],
  );

  useEffect(() => {
    if (!runtime) {
      return;
    }

    runtime.updateComputedDeps(`resolved-props:${nodeId}`, trackedDepsRef.current);
  }, [nodeId, runtime, trackedDepsKey]);

  return resolvedSchemaProps;
}
