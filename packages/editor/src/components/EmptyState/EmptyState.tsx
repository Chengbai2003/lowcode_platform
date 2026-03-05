import React from "react";
import {
  FileQuestion,
  Layers,
  MousePointerClick,
  FolderTree,
  Search,
  type LucideIcon,
} from "lucide-react";
import styles from "./EmptyState.module.css";

export type EmptyStateVariant =
  | "default"
  | "no-schema"
  | "no-selection"
  | "no-components"
  | "no-results"
  | "error";

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
  icon?: LucideIcon;
}

export interface EmptyStateProps {
  /**
   * 预设变体类型
   */
  variant?: EmptyStateVariant;
  /**
   * 自定义图标（优先于预设）
   */
  icon?: LucideIcon;
  /**
   * 自定义标题（优先于预设）
   */
  title?: string;
  /**
   * 自定义描述（优先于预设）
   */
  description?: string;
  /**
   * 操作按钮配置
   */
  actions?: EmptyStateAction[];
  /**
   * 紧凑模式
   */
  compact?: boolean;
  /**
   * 自定义类名
   */
  className?: string;
}

/**
 * 预设配置映射
 */
const PRESET_CONFIG: Record<
  EmptyStateVariant,
  { icon: LucideIcon; title: string; description: string }
> = {
  default: {
    icon: FileQuestion,
    title: "暂无内容",
    description: "这里还没有任何内容",
  },
  "no-schema": {
    icon: Layers,
    title: "暂无 Schema",
    description: "请在左侧编辑器输入或粘贴 Schema 数据",
  },
  "no-selection": {
    icon: MousePointerClick,
    title: "未选中组件",
    description: "请在画布中点击选择一个组件以编辑其属性",
  },
  "no-components": {
    icon: FolderTree,
    title: "组件树为空",
    description: "Schema 中还没有任何组件",
  },
  "no-results": {
    icon: Search,
    title: "未找到结果",
    description: "没有找到匹配的内容",
  },
  error: {
    icon: FileQuestion,
    title: "加载失败",
    description: "内容加载出错，请稍后重试",
  },
};

/**
 * EmptyState - 空状态组件
 * 用于显示无数据、无选中、无结果等空状态
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  variant = "default",
  icon: customIcon,
  title: customTitle,
  description: customDescription,
  actions,
  compact = false,
  className,
}) => {
  const preset = PRESET_CONFIG[variant];
  const Icon = customIcon || preset.icon;
  const title = customTitle || preset.title;
  const description = customDescription || preset.description;

  return (
    <div
      className={`${styles.emptyState} ${compact ? styles.compact : ""} ${className || ""}`}
    >
      <div className={styles.iconWrapper}>
        <Icon size={compact ? 32 : 48} strokeWidth={1.5} />
      </div>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>
      {actions && actions.length > 0 && (
        <div className={styles.actions}>
          {actions.map((action, index) => {
            const ActionIcon = action.icon;
            return (
              <button
                key={index}
                className={`${styles.actionButton} ${styles[`action-${action.variant || "secondary"}`]}`}
                onClick={action.onClick}
              >
                {ActionIcon && <ActionIcon size={14} />}
                {action.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/**
 * 预设空状态组件
 */
export const NoSchemaEmptyState: React.FC<{
  onImport?: () => void;
}> = ({ onImport }) => (
  <EmptyState
    variant="no-schema"
    actions={
      onImport
        ? [{ label: "导入 Schema", onClick: onImport, variant: "primary" }]
        : undefined
    }
  />
);

export const NoSelectionEmptyState: React.FC = () => (
  <EmptyState variant="no-selection" compact />
);

export const NoComponentsEmptyState: React.FC = () => (
  <EmptyState variant="no-components" compact />
);

export const NoResultsEmptyState: React.FC<{
  onClear?: () => void;
}> = ({ onClear }) => (
  <EmptyState
    variant="no-results"
    actions={onClear ? [{ label: "清除筛选", onClick: onClear }] : undefined}
  />
);

export const ErrorEmptyState: React.FC<{
  onRetry?: () => void;
}> = ({ onRetry }) => (
  <EmptyState
    variant="error"
    actions={
      onRetry
        ? [{ label: "重试", onClick: onRetry, variant: "primary" }]
        : undefined
    }
  />
);
