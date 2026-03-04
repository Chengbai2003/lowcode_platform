import { useMemo } from "react";
import type { A2UIComponent, A2UISchema } from "@lowcode-platform/types";
import { useSelectionStore } from "../store";

export interface AIContext {
  selectedComponentIds: string[];
  selectedComponentProps: Record<string, unknown> | null;
  selectedComponentType: string | null;
  formattedContext: string;
}

export interface UseAIContextProps {
  currentSchema: A2UISchema | null;
}

/**
 * AI 上下文 Hook
 * 返回当前选中组件的上下文信息，用于发送给 AI
 */
export const useAIContext = ({
  currentSchema,
}: UseAIContextProps): AIContext => {
  const selectedId = useSelectionStore((state) => state.selectedId);
  const selectedIds = useSelectionStore((state) => state.selectedIds);

  // 获取选中组件的详细信息
  const selectedComponent = useMemo(() => {
    if (!selectedId || !currentSchema?.components[selectedId]) {
      return null;
    }
    return currentSchema.components[selectedId];
  }, [selectedId, currentSchema]);

  // 格式化上下文为人类可读的字符串
  const formattedContext = useMemo(() => {
    if (!selectedComponent) {
      return "";
    }

    const parts: string[] = [];

    // 选中组件信息
    parts.push(`当前选中: ${selectedComponent.type} (ID: ${selectedId})`);

    // 关键属性摘要
    if (selectedComponent.props) {
      const propKeys = Object.keys(selectedComponent.props);
      if (propKeys.length > 0) {
        const propSummary = propKeys
          .slice(0, 5) // 最多显示 5 个属性
          .map((key) => {
            const value = selectedComponent.props![key];
            const displayValue =
              typeof value === "string"
                ? value.length > 20
                  ? value.substring(0, 20) + "..."
                  : value
                : JSON.stringify(value);
            return `${key}=${displayValue}`;
          })
          .join(", ");
        parts.push(`属性: ${propSummary}`);
      }
    }

    // 子组件信息
    if (selectedComponent.childrenIds?.length) {
      parts.push(`子组件数量: ${selectedComponent.childrenIds.length}`);
    }

    return parts.join("\n");
  }, [selectedComponent, selectedId]);

  return {
    selectedComponentIds:
      selectedIds.length > 0 ? selectedIds : selectedId ? [selectedId] : [],
    selectedComponentProps: selectedComponent?.props ?? null,
    selectedComponentType: selectedComponent?.type ?? null,
    formattedContext,
  };
};

/**
 * 获取单个选中组件的 Hook
 */
export const useSelectedComponent = (
  schema: A2UISchema | null,
): A2UIComponent | null => {
  const selectedId = useSelectionStore((state) => state.selectedId);

  return useMemo(() => {
    if (!selectedId || !schema?.components[selectedId]) {
      return null;
    }
    return schema.components[selectedId];
  }, [selectedId, schema]);
};
