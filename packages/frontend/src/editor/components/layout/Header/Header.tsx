import React from "react";
import { Layout, Segmented, Button, Tooltip } from "antd";
import {
  SunOutlined,
  MoonOutlined,
  PlayCircleOutlined,
  UndoOutlined,
  RedoOutlined,
} from "@ant-design/icons";
import styles from "./Header.module.css";

interface EditorHeaderProps {
  previewTheme: "light" | "dark";
  onThemeChange: (theme: "light" | "dark") => void;
  onCompile: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  historySize?: number;
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
}) => {
  return (
    <Layout.Header className={styles.header}>
      <div className={styles.leftSection}>
        <span className={styles.logoIcon}>⚡</span>
        低代码平台
      </div>

      <div className={styles.rightSection}>
        <div className={styles.historyControls}>
          <Tooltip title={`撤销 (Ctrl+Z) - 历史记录: ${historySize}`}>
            <Button
              type="text"
              icon={<UndoOutlined />}
              onClick={onUndo}
              disabled={!canUndo}
              className={`${styles.undoRedoButton} ${!canUndo ? styles.disabled : ""}`}
            />
          </Tooltip>
          <Tooltip title="重做 (Ctrl+Shift+Z / Ctrl+Y)">
            <Button
              type="text"
              icon={<RedoOutlined />}
              onClick={onRedo}
              disabled={!canRedo}
              className={`${styles.undoRedoButton} ${!canRedo ? styles.disabled : ""}`}
            />
          </Tooltip>
        </div>

        <Tooltip title="编译并生成代码">
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={onCompile}
            size="small"
            className={styles.compileButton}
          >
            编译运行
          </Button>
        </Tooltip>

        <div className={styles.themeSelectorContainer}>
          <span className={styles.themeLabel}>预览主题:</span>
          <Segmented
            value={previewTheme}
            onChange={(value: string) =>
              onThemeChange(value as "light" | "dark")
            }
            options={[
              {
                label: "浅色",
                value: "light",
                icon: <SunOutlined />,
              },
              {
                label: "深色",
                value: "dark",
                icon: <MoonOutlined />,
              },
            ]}
            className={styles.segmentedControl}
          />
        </div>
      </div>
    </Layout.Header>
  );
};
