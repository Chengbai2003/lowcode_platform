import React, { useCallback } from "react";
import {
  Zap,
  Edit2,
  Save,
  Undo,
  Redo,
  Play,
  History,
  Moon,
  HelpCircle,
} from "lucide-react";
import styles from "./Header.module.scss";

interface EditorHeaderProps {
  previewTheme: "light" | "dark";
  onThemeChange: (theme: "light" | "dark") => void;
  onCompile: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  historySize?: number;
  mode: "edit" | "preview";
  onModeChange: (mode: "edit" | "preview") => void;
}

export const EditorHeader: React.FC<EditorHeaderProps> = ({
  previewTheme,
  onThemeChange,
  onCompile,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  historySize = 0,
  mode,
  onModeChange,
}) => {
  const handleThemeToggle = useCallback(() => {
    onThemeChange(previewTheme === "light" ? "dark" : "light");
  }, [onThemeChange, previewTheme]);

  return (
    <header className={styles.header}>
      {/* 左侧：Logo + 项目名 */}
      <div className={styles.leftSection}>
        <div className={styles.logoContainer}>
          <div className={styles.logoIcon}>
            <Zap size={20} />
          </div>
          <span className={styles.brandName}>A2UI</span>
        </div>
        <div className={styles.divider}></div>
        <div className={styles.projectName}>
          <span>未命名项目 01</span>
          <Edit2 size={14} />
        </div>
      </div>

      {/* 中间：操作按钮 */}
      <div className={styles.centerSection}>
        <button className={styles.actionButton}>
          <Save size={18} />
          <span>保存</span>
        </button>
        <div className={styles.divider}></div>
        <div className={styles.historyControls}>
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title={`撤销 (${historySize})`}
          >
            <Undo size={18} />
          </button>
          <button onClick={onRedo} disabled={!canRedo} title="重做">
            <Redo size={18} />
          </button>
        </div>
        <div className={styles.divider}></div>
        <button className={styles.compileButton} onClick={onCompile}>
          <Play size={16} />
          编译
        </button>
      </div>

      {/* 右侧：模式切换 + 工具按钮 + 用户头像 */}
      <div className={styles.rightSection}>
        <div className={styles.modeToggle}>
          <button
            className={mode === "edit" ? styles.active : ""}
            onClick={() => onModeChange("edit")}
          >
            编辑
          </button>
          <button
            className={mode === "preview" ? styles.active : ""}
            onClick={() => onModeChange("preview")}
          >
            预览
          </button>
        </div>
        <div className={styles.iconButtons}>
          <button title="历史记录">
            <History size={18} />
          </button>
          <button title="切换主题" onClick={handleThemeToggle}>
            <Moon size={18} />
          </button>
          <button title="帮助">
            <HelpCircle size={18} />
          </button>
        </div>
        <div className={styles.userAvatar}>JD</div>
      </div>
    </header>
  );
};
