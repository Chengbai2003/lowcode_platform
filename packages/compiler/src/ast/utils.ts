export interface FieldInfo {
  name: string;
  setterName: string;
  initialValue: any;
}

export interface CompileOptions {
  componentSources?: Record<string, string>;
  defaultLibrary?: string;
}

// 辅助函数：转驼峰
export function toCamelCase(str: string): string {
  if (!str) return "";
  return str.replace(/([-_.\s][a-z])/g, (group) =>
    group.toUpperCase().replace("-", "").replace("_", "").replace(".", "").replace(" ", "")
  );
}

export interface ExpressionNode {
  __expr: true;
  code: string;
}

export function isExpression(value: unknown): value is ExpressionNode {
  return typeof value === "object" && value !== null && "__expr" in value;
}

export function escapeJSX(str: unknown): string {
  if (typeof str !== "string") return String(str);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\{/g, "&#123;")
    .replace(/\}/g, "&#125;");
}
