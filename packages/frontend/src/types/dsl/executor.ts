import type { Action } from './action-union';
import type { ExecutionContext, ActionRegistry } from './context';

/**
 * DSL执行器配置
 */
export interface ExecutorOptions {
  debug?: boolean;
  maxExecutionTime?: number;
  enableCustomScript?: boolean;
  enablePlugins?: boolean;
  customHandlers?: ActionRegistry;
  onError?: (error: Error, action: Action, context: ExecutionContext) => void;
  onLog?: (level: string, message: string, data?: unknown) => void;
}
