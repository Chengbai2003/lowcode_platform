/**
 * Action执行结果
 */
export interface ActionResult {
  success: boolean;
  value?: any;
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
