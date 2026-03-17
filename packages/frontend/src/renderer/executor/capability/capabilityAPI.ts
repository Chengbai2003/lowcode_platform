/**
 * 脚本能力 API（Phase 3）
 * 为 customScript 提供受控的组件操作接口，收窄脚本可操作的 API 面
 */

// 前向声明 ReactiveRuntime 类型，避免循环依赖
import type { ReactiveRuntime } from '../../reactive';

export interface CapabilityAPI {
  /** 读取组件值（只读快照） */
  get(componentId: string): any;
  /** 设置组件值（经过校验，走 EventDispatcher 通知链路） */
  set(componentId: string, value: any): void;
  /** 批量更新 */
  patch(updates: Record<string, any>): void;
  /** 安全日志 */
  log(...args: any[]): void;
}

export interface CapabilityAPIOptions {
  /** 当前 schema 中所有合法的 componentId */
  validComponentIds: Set<string>;

  // Phase 2: 直接 runtime 访问
  /** ReactiveRuntime 实例（用于精准脏追踪） */
  runtime?: ReactiveRuntime;

  // 遗留：当 runtime 不可用时保持向后兼容
  /** 读取组件数据 */
  getData?: () => Record<string, any>;
  /** 写入组件数据（走 dispatch + eventDispatcher 通知链路） */
  setComponentData?: (id: string, value: any) => void;
  /** 通知响应式系统 */
  markFullChange?: () => void;
}

/**
 * 创建 CapabilityAPI 实例
 */
export function createCapabilityAPI(options: CapabilityAPIOptions): CapabilityAPI {
  const { validComponentIds, runtime, getData, setComponentData, markFullChange } = options;

  function isForbiddenComponentId(componentId: string): boolean {
    return (
      componentId === '__proto__' || componentId === 'constructor' || componentId === 'prototype'
    );
  }

  function validateComponentId(componentId: string, throwOnInvalid = true): boolean {
    if (typeof componentId !== 'string' || !componentId) {
      if (throwOnInvalid) {
        throw new Error(`[CapabilityAPI] Invalid componentId: ${componentId}`);
      }
      console.warn(`[CapabilityAPI] Invalid componentId: ${componentId}`);
      return false;
    }
    if (isForbiddenComponentId(componentId)) {
      throw new Error(`[CapabilityAPI] Forbidden componentId: ${componentId}`);
    }
    if (!validComponentIds.has(componentId)) {
      if (throwOnInvalid) {
        throw new Error(`[CapabilityAPI] Unknown componentId "${componentId}"`);
      }
      console.warn(
        `[CapabilityAPI] Unknown componentId "${componentId}". ` +
          `Valid IDs: ${[...validComponentIds].slice(0, 10).join(', ')}${validComponentIds.size > 10 ? '...' : ''}`,
      );
      return false;
    }
    return true;
  }

  return {
    get(componentId: string): any {
      if (!validateComponentId(componentId, false)) {
        return undefined;
      }

      // Phase 2: Runtime 路径
      if (runtime) {
        return runtime.get(componentId);
      }

      // 遗留
      const data = getData?.() ?? {};
      return data[componentId];
    },

    set(componentId: string, value: any): void {
      // Throws for truly invalid IDs (empty/non-string); warns but proceeds for unknown-but-valid IDs
      validateComponentId(componentId);

      // Phase 2: Runtime 路径 - 精准脏追踪
      if (runtime) {
        runtime.set(componentId, value);
        return; // 不需要 markFullChange
      }

      // 遗留：Redux dispatch + 全量失效
      setComponentData?.(componentId, value);
      markFullChange?.();
    },

    patch(updates: Record<string, any>): void {
      if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
        throw new Error('[CapabilityAPI] patch expects a plain object');
      }

      // 首先验证所有 ID
      for (const id of Object.keys(updates)) {
        validateComponentId(id);
      }

      // Phase 2: Runtime 路径 - 批量更新，单次通知
      if (runtime) {
        runtime.patch(updates);
        return; // 不需要 markFullChange
      }

      // 遗留：多次写入 + 单次全量失效
      let hasWrite = false;
      for (const [id, value] of Object.entries(updates)) {
        setComponentData?.(id, value);
        hasWrite = true;
      }
      if (hasWrite) {
        markFullChange?.();
      }
    },

    log(...args: any[]): void {
      console.log('[Sandbox Log]:', ...args);
    },
  };
}
