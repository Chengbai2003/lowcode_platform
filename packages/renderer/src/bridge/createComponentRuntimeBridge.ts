import type { EventDispatcher } from '../EventDispatcher';
import { DSLExecutor } from '../executor';
import { resolveValue } from '../executor/parser/valueResolver';
import type { Value } from '../dsl';
import type { ComponentRuntimeBridge, DataResourceState } from './ComponentRuntimeBridge';

/**
 * 从 EventDispatcher 构建组件运行时桥。
 *
 * Renderer 内部工厂：执行器细节（DSLExecutor / valueResolver）只允许
 * 存在于本包内；组件侧只能拿到 ComponentRuntimeBridge 接口。
 */
export function createComponentRuntimeBridge(
  eventDispatcher: EventDispatcher | undefined,
): ComponentRuntimeBridge {
  return {
    resolveValue(value, scope) {
      const base = eventDispatcher?.getExecutionContext() ?? {};
      const context = DSLExecutor.createContext({ ...base, ...scope });
      return resolveValue(value as Value, context);
    },

    async executeActions(actions, event, extraContext) {
      if (!eventDispatcher) {
        throw new Error('ComponentRuntimeBridge: renderer runtime is not attached');
      }
      return eventDispatcher.execute(actions, event, extraContext ?? {});
    },

    getResource(): Readonly<DataResourceState> {
      // M1b 前默认 deny（fail-close）：组件不得未经宿主授权访问数据资源
      return Object.freeze({
        status: 'error' as const,
        error: 'ComponentRuntimeBridge: data resource capability is not granted before M1b',
      });
    },
  };
}
