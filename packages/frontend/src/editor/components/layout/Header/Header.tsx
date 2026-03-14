import React, { useCallback, useState } from 'react';
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
  LayoutGrid,
} from 'lucide-react';
import { TemplateGallery } from '../../TemplateGallery/TemplateGallery';
import type { Template } from '../../../templates/types';
import { useEditorStore } from '../../../store/editor-store';
import styles from './Header.module.scss';

/**
 * 默认项目名称常量
 */
const DEFAULT_PROJECT_NAME = '未命名项目 01';

interface EditorHeaderProps {
  previewTheme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => void;
  onCompile: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  historySize?: number;
  mode: 'edit' | 'preview';
  onModeChange: (mode: 'edit' | 'preview') => void;
  onApplyTemplate?: (schema: Template['schema']) => void;
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
  onApplyTemplate,
}) => {
  const [templateGalleryOpen, setTemplateGalleryOpen] = useState(false);
  const setHistoryDrawerOpen = useEditorStore((state) => state.setHistoryDrawerOpen);

  const handleThemeToggle = useCallback(() => {
    onThemeChange(previewTheme === 'light' ? 'dark' : 'light');
  }, [onThemeChange, previewTheme]);

  const handleApplyTemplate = useCallback(
    (schema: Template['schema']) => {
      if (onApplyTemplate) {
        onApplyTemplate(schema);
      }
    },
    [onApplyTemplate],
  );

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
          <span>{DEFAULT_PROJECT_NAME}</span>
          <Edit2 size={14} />
        </div>
      </div>

      {/* 中间：操作按钮 */}
      <div className={styles.centerSection}>
        <button
          className={styles.actionButton}
          onClick={() => setTemplateGalleryOpen(true)}
          title="选择模板"
        >
          <LayoutGrid size={18} />
          <span>模板</span>
        </button>
        <div className={styles.divider}></div>
        {/* 保存按钮 - TODO: 实现保存功能 */}
        <button className={styles.actionButton} disabled title="保存功能开发中">
          <Save size={18} />
          <span>保存</span>
        </button>
        <div className={styles.divider}></div>
        <div className={styles.historyControls}>
          <button onClick={onUndo} disabled={!canUndo} title={`撤销 (${historySize})`}>
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
            className={mode === 'edit' ? styles.active : ''}
            onClick={() => onModeChange('edit')}
          >
            编辑
          </button>
          <button
            className={mode === 'preview' ? styles.active : ''}
            onClick={() => onModeChange('preview')}
          >
            预览
          </button>
        </div>
        <div className={styles.iconButtons}>
          <button title="历史记录" onClick={() => setHistoryDrawerOpen(true)}>
            <History size={18} />
          </button>
          <button title="切换主题（已禁用）" onClick={handleThemeToggle} disabled>
            <Moon size={18} />
          </button>
          {/* TODO: 实现帮助功能 */}
          <button title="帮助" disabled>
            <HelpCircle size={18} />
          </button>
        </div>
        <div className={styles.userAvatar}>JD</div>
      </div>

      {/* 模板选择器 */}
      <TemplateGallery
        open={templateGalleryOpen}
        onClose={() => setTemplateGalleryOpen(false)}
        onApply={handleApplyTemplate}
      />
    </header>
  );
};
