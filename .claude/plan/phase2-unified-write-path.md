# Phase 2: Unified Write Path Implementation Plan

> Generated: 2026-03-16
> Based on: PLAN_ReactiveRuntime_v3.md Phase 2
> Branch: refactor/renderer-proxy-reactivity

---

## Overview

**Goal**: All writes go through ReactiveRuntime, removing dual-write patterns and `markFullChange()` full invalidation.

**Current State (Phase 1 Complete)**:

- ReactiveRuntime is implemented and functional
- EventDispatcher has optional runtime integration (feature flag: `useReactiveRuntime`)
- Still has dual-write: executionContext.data + runtime

**Target State (Phase 2)**:

- Single write path through ReactiveRuntime
- Precise dirty path tracking (no more `markFullChange()`)
- All DSL actions use runtime.set()
- CapabilityAPI uses runtime directly
- ComponentRenderer removes Redux dispatch

---

## Write Paths to Migrate

| #   | Source            | File                            | Current Target                    | Problem           |
| --- | ----------------- | ------------------------------- | --------------------------------- | ----------------- |
| 1   | UI Input onChange | `ComponentRenderer.tsx:169-211` | Redux + executionContext          | Dual-write        |
| 2   | EventDispatcher   | `EventDispatcher.ts:217-235`    | executionContext.data + runtime   | Dual-write        |
| 3   | setValue action   | `dataActions.ts:28-101`         | context.data + markFullChange()   | Full invalidation |
| 4   | apiCall resultTo  | `asyncActions.ts:145-160`       | context.data + markFullChange()   | Full invalidation |
| 5   | CapabilityAPI     | `capabilityAPI.ts:61-82`        | Redux dispatch + markFullChange() | Full invalidation |

---

## Implementation Steps

### Step 1: Add Runtime to ExecutionContext

**File**: `packages/frontend/src/types/dsl/context.ts`

**Change**: Add optional `runtime` field to ExecutionContext

```typescript
// Add import
import type { ReactiveRuntime } from '../../renderer/reactive';

// In ExecutionContext interface
interface ExecutionContext {
  // ... existing fields ...

  // NEW: ReactiveRuntime for unified write path
  runtime?: ReactiveRuntime;
}
```

**Rationale**: Action handlers need access to runtime for writes.

---

### Step 2: Pass Runtime to ExecutionContext

**File**: `packages/frontend/src/renderer/EventDispatcher.ts`

**Change**: Include runtime in executionContext creation

```typescript
// In getExecutionContext() method
getExecutionContext(): ExecutionContext {
  return {
    ...this.executionContext,
    // Add runtime reference
    runtime: this.runtime || undefined,
  };
}
```

**Rationale**: Makes runtime accessible to all action handlers.

---

### Step 3: Migrate setValue Action

**File**: `packages/frontend/src/renderer/executor/actions/dataActions.ts`

**Changes**:

1. Check for runtime first
2. Preserve merge mode logic
3. Keep prototype pollution protection

```typescript
export const setValue: ActionHandler = async (action, context) => {
  const { field, value, merge } = action as SetValueAction;
  const resolvedValue = await resolveValue(value, context);

  // NEW: Runtime path (Phase 2)
  if (context.runtime) {
    if (merge && typeof resolvedValue === 'object' && resolvedValue !== null) {
      const current = context.runtime.get(field);
      const merged = { ...(current as Record<string, unknown>), ...resolvedValue };
      context.runtime.set(field, merged);
    } else {
      context.runtime.set(field, resolvedValue);
    }
    // No markFullChange needed - runtime tracks dirty paths
    return resolvedValue;
  }

  // LEGACY: Direct mutation path (keep for backward compatibility)
  // ... existing code ...
};
```

**Key Considerations**:

- `merge` mode is NOT supported by runtime.set() natively
- Keep `isSafeKey()` prototype pollution checks in legacy path
- Runtime handles `state.xxx`, `formData.xxx` path prefixes automatically

---

### Step 4: Migrate apiCall resultTo

**File**: `packages/frontend/src/renderer/executor/actions/asyncActions.ts`

**Changes**:

1. Use runtime.set() for resultTo
2. Add prototype pollution protection (import from dataActions)
3. Support all namespaces

```typescript
// After successful API response
if (resultTo) {
  // NEW: Runtime path (Phase 2)
  if (context.runtime) {
    context.runtime.set(resultTo, response);
    // No markFullChange needed
  } else if (context.data) {
    // LEGACY: Direct mutation
    const keys = resultTo.split('.');
    // ... existing manual path code ...

    if (typeof context.markFullChange === 'function') {
      context.markFullChange();
    }
  }
}
```

**Add Security**: Import and use `isSafeKey()` from dataActions for legacy path.

---

### Step 5: Migrate CapabilityAPI

**File**: `packages/frontend/src/renderer/executor/capability/capabilityAPI.ts`

**Changes**:

1. Add runtime to options
2. Use runtime.set() / runtime.patch() directly
3. Remove markFullChange() calls

```typescript
export interface CapabilityAPIOptions {
  validComponentIds: Set<string>;
  // NEW: Direct runtime access
  runtime?: ReactiveRuntime;
  // LEGACY: Keep for backward compatibility
  getData?: () => Record<string, any>;
  setComponentData?: (id: string, value: any) => void;
  markFullChange?: () => void;
}

export function createCapabilityAPI(options: CapabilityAPIOptions): CapabilityAPI {
  const { validComponentIds, runtime } = options;

  return {
    get(componentId: string): any {
      validateComponentId(componentId);
      // NEW: Runtime path
      if (runtime) {
        return runtime.get(componentId);
      }
      // LEGACY
      return options.getData?.() ?? {};
    },

    set(componentId: string, value: any): void {
      validateComponentId(componentId);
      // NEW: Runtime path
      if (runtime) {
        runtime.set(componentId, value);
        return; // No markFullChange needed
      }
      // LEGACY
      options.setComponentData?.(componentId, value);
      options.markFullChange?.();
    },

    patch(updates: Record<string, any>): void {
      // Validate all IDs first
      for (const id of Object.keys(updates)) {
        validateComponentId(id);
      }
      // NEW: Runtime path
      if (runtime) {
        runtime.patch(updates);
        return;
      }
      // LEGACY
      for (const [id, value] of Object.entries(updates)) {
        options.setComponentData?.(id, value);
      }
      options.markFullChange?.();
    },

    // ... log remains same
  };
}
```

---

### Step 6: Update extensionActions to Pass Runtime

**File**: `packages/frontend/src/renderer/executor/actions/extensionActions.ts`

**Change**: Pass runtime to CapabilityAPI

```typescript
const api = createCapabilityAPI({
  validComponentIds,
  // NEW: Pass runtime
  runtime: context.runtime,
  // LEGACY: Keep for backward compatibility
  getData: () => context.data || {},
  setComponentData: context.setComponentData,
  markFullChange: context.markFullChange,
});
```

---

### Step 7: Simplify EventDispatcher.\_writeComponentData

**File**: `packages/frontend/src/renderer/EventDispatcher.ts`

**Change**: Single write to runtime when enabled

```typescript
private _writeComponentData(componentId: string, value: any) {
  // NEW: Runtime-only path when feature flag is on
  if (this.runtime && getFlag('useReactiveRuntime')) {
    this.runtime.set(componentId, value);
    return; // Done - runtime handles everything
  }

  // LEGACY: executionContext + runtime dual write
  const currentData = this.executionContext.data || {};
  this.executionContext = {
    ...this.executionContext,
    data: { ...currentData, [componentId]: value },
  };

  if (this.runtime) {
    this.runtime.set(componentId, value);
    return;
  }

  // Legacy flush mechanism
  this.addPendingKey(componentId);
  this.scheduleFlush();
}
```

---

### Step 8: Remove Redux Dispatch from ComponentRenderer

**File**: `packages/frontend/src/renderer/ComponentRenderer.tsx`

**Change**: Only call EventDispatcher, remove direct Redux dispatch

```typescript
// BEFORE (dual write):
p.onChange = (e: any, ...args: any[]) => {
  // ... value extraction ...
  dispatch(setComponentData({ id, value })); // REMOVE
  if (eventDispatcher) {
    eventDispatcher.updateComponentData(id, value); // KEEP
  }
};

// AFTER (single write):
p.onChange = (e: any, ...args: any[]) => {
  // ... value extraction ...
  if (eventDispatcher) {
    eventDispatcher.updateComponentData(id, value); // Single write path
  }
};
```

**Same for onValuesChange (Form)**:

```typescript
p.onValuesChange = (changedValues: any, allValues: any, ...args: any[]) => {
  const newValue = { ...(componentValue || {}), ...allValues };
  // dispatch(setComponentData({ id, value: newValue }));  // REMOVE
  if (eventDispatcher) {
    eventDispatcher.updateComponentData(id, newValue);
  }
};
```

---

### Step 9: Update Feature Flag Default

**File**: `packages/frontend/src/renderer/featureFlags.ts`

**Change**: Enable runtime by default after testing

```typescript
export const DEFAULT_FLAGS: FeatureFlags = {
  useReactiveRuntime: true, // Changed from false
  runtimeDebug: false,
};
```

**Timing**: Do this after all tests pass.

---

## Migration Order (Recommended)

```
Step 1: Add runtime to ExecutionContext
    ↓
Step 2: Pass runtime from EventDispatcher
    ↓
Step 3: Migrate dataActions.setValue
    ↓
Step 4: Migrate asyncActions.apiCall
    ↓
Step 5: Migrate CapabilityAPI
    ↓
Step 6: Update extensionActions
    ↓
Step 7: Simplify EventDispatcher
    ↓
Step 8: Remove Redux dispatch from ComponentRenderer
    ↓
Step 9: Enable feature flag
```

---

## Key Files Summary

| File                                            | Operation | Description                             |
| ----------------------------------------------- | --------- | --------------------------------------- |
| `types/dsl/context.ts`                          | Modify    | Add `runtime?: ReactiveRuntime`         |
| `renderer/EventDispatcher.ts`                   | Modify    | Pass runtime to context, simplify write |
| `renderer/executor/actions/dataActions.ts`      | Modify    | Use runtime.set() for setValue          |
| `renderer/executor/actions/asyncActions.ts`     | Modify    | Use runtime.set() for resultTo          |
| `renderer/executor/capability/capabilityAPI.ts` | Modify    | Direct runtime access                   |
| `renderer/executor/actions/extensionActions.ts` | Modify    | Pass runtime to CapabilityAPI           |
| `renderer/ComponentRenderer.tsx`                | Modify    | Remove Redux dispatch                   |
| `renderer/featureFlags.ts`                      | Modify    | Enable flag after testing               |

---

## Testing Strategy

### Unit Tests (New)

1. **dataActions with runtime**:
   - setValue uses runtime.set()
   - Merge mode works
   - Deep path works

2. **asyncActions with runtime**:
   - resultTo uses runtime.set()
   - Deep path works

3. **CapabilityAPI with runtime**:
   - set() uses runtime
   - patch() uses runtime
   - Invalid componentId rejected

### Integration Tests (Existing)

- `cross-component-reactivity.test.tsx` - must pass
- `capability-api.test.ts` - must pass
- `extension-actions.test.ts` - must pass

### Manual Testing

1. Create schema with multiple components
2. Test input value changes
3. Test Form value changes
4. Test setValue DSL action
5. Test apiCall with resultTo
6. Test customScript $.set() and $.patch()
7. Verify no full re-renders on single component update

---

## Rollback Strategy

If issues arise:

1. Set `useReactiveRuntime: false` in featureFlags
2. Legacy paths remain functional
3. No data loss - both paths write to same conceptual state

---

## Risks and Mitigation

| Risk                      | Mitigation                                                         |
| ------------------------- | ------------------------------------------------------------------ |
| Merge mode not in runtime | Keep merge logic in dataActions before runtime.set()               |
| Prototype pollution       | Keep isSafeKey() checks in legacy path, consider adding to runtime |
| Race conditions in async  | Runtime batch() for multiple writes                                |
| Performance regression    | Profile before/after, check render count                           |
| Concurrent mode tearing   | useSyncExternalStore ensures consistency                           |

---

## Acceptance Criteria

- [ ] No write path directly mutates `context.data`
- [ ] All writes go through `runtime.set()` or `runtime.patch()`
- [ ] `markFullChange()` not called on normal writes
- [ ] Deep path writes work correctly
- [ ] Cross-component reactivity tests pass
- [ ] No full re-renders on single component update
- [ ] Feature flag can disable runtime (rollback)

---

## Next Phase (Phase 3)

After Phase 2 is complete:

- Migrate read paths to runtime
- Remove Redux dependency from ComponentRenderer
- Implement `useRuntimeValue()` hook
- Replace `useAppSelector` with runtime subscription
