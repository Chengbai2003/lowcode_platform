/**
 * @lowcode-platform/editor
 *
 * 低代码平台 JSON 编辑器，支持后端通信
 * 功能：
 * - 集成 Monaco 编辑器
 * - 左右分栏布局（编辑器 + 预览）
 * - 实时渲染
 * - 错误处理
 * - Bearer Token 认证
 */

import { fetchApp } from "./lib/httpClient";

// ============================================
// 认证初始化
// ============================================

// 默认 API Secret（使用环境变量或默认值）
const DEFAULT_API_SECRET =
  (import.meta.env?.VITE_API_SECRET as string) || 'dev-secret-token-change-in-production';

// 初始化时设置默认 Token
fetchApp.setApiSecret(DEFAULT_API_SECRET);

/**
 * 设置 API Secret（供宿主应用调用）
 *
 * @param token - API Secret
 *
 * @example
 * ```typescript
 * import { setApiSecret } from '@lowcode-platform/editor';
 *
 * setApiSecret('your-production-secret');
 * ```
 */
export function setApiSecret(token: string): void {
  fetchApp.setApiSecret(token);
}

/**
 * 获取当前 API Secret（调试用）
 */
export function getApiSecret(): string {
  return (fetchApp as any).apiSecret;
}

// 导出样式
import "./components/AI/AIAssistant.css";
import "./components/AI/AIConfig.css";
import "./components/AIAssistant.css";

export { LowcodeEditor } from "./LowcodeEditor";
export type { LowcodeEditorProps } from "./types";
export { AIAssistant } from "./components/AIAssistant";
