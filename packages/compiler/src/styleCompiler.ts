import type { CSSProperties } from "react";

// Step 1: 建立映射字典

// 静态值映射：直接映射到 Tailwind 类名
const STATIC_MAP: Record<string, Record<string, string>> = {
  display: {
    flex: "flex",
    block: "block",
    inline: "inline",
    "inline-block": "inline-block",
    none: "hidden",
    grid: "grid",
  },
  flexDirection: {
    row: "flex-row",
    column: "flex-col",
    "row-reverse": "flex-row-reverse",
    "column-reverse": "flex-col-reverse",
  },
  justifyContent: {
    "flex-start": "justify-start",
    "flex-end": "justify-end",
    center: "justify-center",
    "space-between": "justify-between",
    "space-around": "justify-around",
    "space-evenly": "justify-evenly",
  },
  alignItems: {
    "flex-start": "items-start",
    "flex-end": "items-end",
    center: "items-center",
    baseline: "items-baseline",
    stretch: "items-stretch",
  },
  textAlign: {
    left: "text-left",
    center: "text-center",
    right: "text-right",
    justify: "text-justify",
  },
  position: {
    static: "static",
    fixed: "fixed",
    absolute: "absolute",
    relative: "relative",
    sticky: "sticky",
  },
  cursor: {
    pointer: "cursor-pointer",
    default: "cursor-default",
    text: "cursor-text",
    move: "cursor-move",
    "not-allowed": "cursor-not-allowed",
  },
};

// 前缀映射：需要处理数值或颜色
const PREFIX_MAP: Record<string, string> = {
  width: "w",
  height: "h",
  minWidth: "min-w",
  maxWidth: "max-w",
  minHeight: "min-h",
  maxHeight: "max-h",
  margin: "m",
  marginTop: "mt",
  marginBottom: "mb",
  marginLeft: "ml",
  marginRight: "mr",
  padding: "p",
  paddingTop: "pt",
  paddingBottom: "pb",
  paddingLeft: "pl",
  paddingRight: "pr",
  backgroundColor: "bg",
  color: "text",
  fontSize: "text",
  fontWeight: "font",
  borderRadius: "rounded",
  border: "border",
  borderWidth: "border",
  borderColor: "border",
  zIndex: "z",
  opacity: "opacity",
  boxShadow: "shadow",
  gap: "gap",
  flex: "flex",
  flexGrow: "grow",
  flexShrink: "shrink",
};

// Step 2: 实现转换逻辑

export interface CompiledStyle {
  className: string;
  styleObj: Record<string, any>;
}

export function compileStyle(
  style: Record<string, any> | undefined
): CompiledStyle {
  if (!style) {
    return { className: "", styleObj: {} };
  }

  const classList: string[] = [];
  const styleObj: Record<string, any> = {};

  Object.entries(style).forEach(([key, value]) => {
    // 忽略空值
    if (value === undefined || value === null || value === "") {
      return;
    }

    const strValue = String(value).trim();

    // 1. 静态匹配
    if (STATIC_MAP[key] && STATIC_MAP[key][strValue]) {
      classList.push(STATIC_MAP[key][strValue]);
      return;
    }

    // 2. JIT 数值转换
    const prefix = PREFIX_MAP[key];
    if (prefix) {
      // 特殊值处理：100% 或 full
      if (strValue === "100%" || strValue === "full") {
        classList.push(`${prefix}-full`);
        return;
      }

      // 特殊处理：auto
      if (strValue === "auto") {
        classList.push(`${prefix}-auto`);
        return;
      }

      // 任意值处理：使用 [] 语法
      // JIT 语法要求：不包含空格，空格转下划线
      // 检查 value 是否复杂（含 calc, var, url）
      if (isComplexValue(strValue)) {
        // 复杂值保留为内联样式
        styleObj[key] = value;
      } else {
        const jitValue = strValue.replace(/\s+/g, "_");
        classList.push(`${prefix}-[${jitValue}]`);
      }
      return;
    }

    // 3. 兜底策略：保留在 styleObj 中
    styleObj[key] = value;
  });

  return {
    className: classList.join(" "),
    styleObj,
  };
}

// 辅助函数：判断是否为复杂值，不适合转换为 JIT class
function isComplexValue(value: string): boolean {
  return (
    value.includes("calc(") ||
    value.includes("var(") ||
    value.includes("url(") ||
    value.includes('"') ||
    value.includes("'")
  );
}
