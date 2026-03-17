import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { EventDispatcher } from './EventDispatcher';
import { getFlag } from './featureFlags';
import type { ComponentDeps } from './reactive/dependencyAnalyzer';
import { setsOverlap } from './reactive/dependencyAnalyzer';
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

  const runtime = eventDispatcher.getRuntime();
  if (runtime) {
    const runtimeValue = runtime.get(id);
    if (runtimeValue !== undefined) {
      return runtimeValue;
    }
  }

  return eventDispatcher.getExecutionContext().data?.[id];
}

export function useNodeValue(
  id: string | undefined,
  schemaInitialValue: unknown,
  eventDispatcher: EventDispatcher | undefined,
): unknown {
  const reactiveEnabled = getFlag('reactiveContext') || getFlag('useReactiveRuntime');
  const runtime = eventDispatcher?.getRuntime() ?? null;

  const version = useSyncExternalStore(
    reactiveEnabled
      ? runtime && id
        ? (listener) =>
            runtime.subscribeComputed(`node-value:${id}`, listener, new Set([`data.${id}`]))
        : (eventDispatcher?.subscribe ?? noopSubscribe)
      : noopSubscribe,
    reactiveEnabled ? (eventDispatcher?.getVersion ?? noopGetVersion) : noopGetVersion,
  );

  return useMemo(() => {
    const value = readComponentValue(eventDispatcher, id);
    return value !== undefined ? value : schemaInitialValue;
  }, [eventDispatcher, id, schemaInitialValue, runtime, version]);
}

export function useResolvedSchemaProps(
  nodeId: string,
  id: string | undefined,
  props: Record<string, any>,
  eventDispatcher: EventDispatcher | undefined,
  deps: ComponentDeps,
): Record<string, any> {
  const reactiveEnabled = getFlag('reactiveContext') || getFlag('useReactiveRuntime');
  const runtime = eventDispatcher?.getRuntime() ?? null;
  const trackedDepsRef = useRef<Set<string>>(new Set());
  const prevResolvedRef = useRef<Record<string, any> | null>(null);
  const lastConsumedVersionRef = useRef(0);
  const contextVersion = useSyncExternalStore(
    reactiveEnabled
      ? runtime
        ? (listener) =>
            runtime.subscribeComputed(`resolved-props:${nodeId}`, listener, trackedDepsRef.current)
        : (eventDispatcher?.subscribe ?? noopSubscribe)
      : noopSubscribe,
    reactiveEnabled
      ? runtime
        ? () => runtime.getVersion()
        : (eventDispatcher?.getVersion ?? noopGetVersion)
      : noopGetVersion,
  );
  const resolvedSchemaProps = useMemo(() => {
    if (!eventDispatcher) {
      return props;
    }

    if (getFlag('selectiveEvaluation') && prevResolvedRef.current !== null) {
      if (runtime) {
        const changed = runtime.getDirtyPaths(lastConsumedVersionRef.current);
        if (!hasAffectedRuntimeDeps(changed, trackedDepsRef.current)) {
          lastConsumedVersionRef.current = contextVersion;
          return prevResolvedRef.current;
        }
      } else if (getFlag('reactiveContext') && !deps.hasDynamicDeps) {
        const changed = eventDispatcher.getChangedKeysForVersion(lastConsumedVersionRef.current);
        if (changed !== 'all' && changed.size > 0 && !setsOverlap(changed, deps.dataDeps)) {
          lastConsumedVersionRef.current = contextVersion;
          return prevResolvedRef.current;
        }
      }
    }

    try {
      let nextTrackedDeps = trackedDepsRef.current;
      let result: Record<string, any>;

      if (runtime) {
        runtime.startTracking();
        try {
          result = resolveValues(props, eventDispatcher.getExecutionContext());
          nextTrackedDeps = runtime.stopTracking();
        } catch (error) {
          runtime.stopTracking();
          throw error;
        }
      } else {
        result = resolveValues(props, eventDispatcher.getExecutionContext());
      }

      trackedDepsRef.current = nextTrackedDeps;
      prevResolvedRef.current = result;
      lastConsumedVersionRef.current = contextVersion;
      return result;
    } catch (error) {
      console.warn('[Renderer] Failed to resolve props expressions', {
        id,
        nodeId,
        error,
      });
      return props;
    }
  }, [contextVersion, deps, eventDispatcher, id, nodeId, props]);

  const trackedDepsKey = useMemo(
    () => serializeDeps(trackedDepsRef.current),
    [resolvedSchemaProps],
  );

  useEffect(() => {
    if (!runtime || typeof runtime.updateComputedDeps !== 'function') {
      return;
    }

    runtime.updateComputedDeps(`resolved-props:${nodeId}`, trackedDepsRef.current);
  }, [nodeId, runtime, trackedDepsKey]);

  return resolvedSchemaProps;
}
