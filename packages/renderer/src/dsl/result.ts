/**
 * Action执行结果
 */
export interface ActionResult<T = unknown> {
  success: boolean;
  value?: T;
  error?: Error;
  duration?: number;
}

/**
 * 批量执行结果
 */
export interface BatchActionResult {
  total: number;
  success: number;
  failed: number;
  results: ActionResult[];
  duration: number;
}
