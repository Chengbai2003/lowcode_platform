/**
 * 脚本能力 API（Phase 3）
 * 为 customScript 提供受控的组件操作接口，收窄脚本可操作的 API 面
 */

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
  /** 读取组件数据 */
  getData: () => Record<string, any>;
  /** 写入组件数据（走 dispatch + eventDispatcher 通知链路） */
  setComponentData: (id: string, value: any) => void;
  /** 通知响应式系统 */
  markFullChange: () => void;
}

/**
 * 创建 CapabilityAPI 实例
 */
export function createCapabilityAPI(options: CapabilityAPIOptions): CapabilityAPI {
  const { validComponentIds, getData, setComponentData, markFullChange } = options;

  function validateComponentId(componentId: string, throwOnInvalid = true): boolean {
    if (typeof componentId !== 'string' || !componentId) {
      if (throwOnInvalid) {
        throw new Error(`[CapabilityAPI] Invalid componentId: ${componentId}`);
      }
      console.warn(`[CapabilityAPI] Invalid componentId: ${componentId}`);
      return false;
    }
    if (!validComponentIds.has(componentId)) {
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
      const data = getData();
      return data[componentId];
    },

    set(componentId: string, value: any): void {
      // Throws for truly invalid IDs (empty/non-string); warns but proceeds for unknown-but-valid IDs
      validateComponentId(componentId);
      setComponentData(componentId, value);
      markFullChange();
    },

    patch(updates: Record<string, any>): void {
      if (!updates || typeof updates !== 'object') {
        throw new Error('[CapabilityAPI] patch expects a plain object');
      }
      let hasWrite = false;
      for (const [id, value] of Object.entries(updates)) {
        // Throws for truly invalid IDs; warns but proceeds for unknown-but-valid IDs
        validateComponentId(id);
        setComponentData(id, value);
        hasWrite = true;
      }
      if (hasWrite) {
        markFullChange();
      }
    },

    log(...args: any[]): void {
      console.log('[Sandbox Log]:', ...args);
    },
  };
}
