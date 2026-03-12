import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { ConfigProvider, theme, message, notification, Modal } from 'antd';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink } from 'lucide-react';
import type { EventContext, EventUIContext, LowcodeEditorProps } from './types';
import type { A2UISchema } from '../types';
import { componentRegistry } from '../components';
import { compileSchema } from './services/compilerApi';
import {
  EditorHeader,
  PreviewPane,
  PropertyPanel,
  ErrorBoundary,
  useUndoRedoShortcuts,
} from './components';
import { ComponentTree } from './components/TreeView/ComponentTree';
import { useFloatingIslandHotkey } from './hooks/useFloatingIslandHotkey';
import { useSchemaHistoryStore } from './hooks/useSchemaHistoryStore';
import { FloatingIsland } from './components/ai-assistant/FloatingIsland';
import { HistoryDrawer } from './components/ai-assistant/HistoryDrawer';
import { useSelectionStore } from './store/editor-store';
import styles from './LowcodeEditor.module.scss';

/**
 * 编辑器内部组件
 */
function LowcodeEditorInner({
  initialSchema,
  components: customComponents = {},
  onChange,
  onError,
  eventContext = {},
}: LowcodeEditorProps) {
  // 初始化 Schema
  const defaultSchema: A2UISchema = useMemo(
    () => ({
      rootId: 'root',
      components: {
        root: {
          id: 'root',
          type: 'Page',
          props: {},
          childrenIds: [],
        },
      },
    }),
    [],
  );

  const initialSchemaObj = useMemo(() => {
    if (typeof initialSchema === 'string') {
      try {
        return JSON.parse(initialSchema);
      } catch {
        return defaultSchema;
      }
    }
    return initialSchema || defaultSchema;
  }, [initialSchema, defaultSchema]);

  const [schema, setSchema] = useState<A2UISchema>(initialSchemaObj);
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>('light');
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [compiledCode, setCompiledCode] = useState<string | null>(null);

  const uiContext = useMemo<EventUIContext>(() => {
    const modal = {
      confirm: (options: Parameters<typeof Modal.confirm>[0]) =>
        new Promise<boolean>((resolve) => {
          Modal.confirm({
            ...options,
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
          });
        }),
      info: (options: Parameters<typeof Modal.info>[0]) =>
        new Promise<void>((resolve) => {
          Modal.info({
            ...options,
            onOk: () => resolve(),
          });
        }),
      success: (options: Parameters<typeof Modal.success>[0]) =>
        new Promise<void>((resolve) => {
          Modal.success({
            ...options,
            onOk: () => resolve(),
          });
        }),
      error: (options: Parameters<typeof Modal.error>[0]) =>
        new Promise<void>((resolve) => {
          Modal.error({
            ...options,
            onOk: () => resolve(),
          });
        }),
      warning: (options: Parameters<typeof Modal.warning>[0]) =>
        new Promise<void>((resolve) => {
          Modal.warning({
            ...options,
            onOk: () => resolve(),
          });
        }),
    };

    return {
      message: {
        success: (content: string) => message.success(content),
        error: (content: string) => message.error(content),
        warning: (content: string) => message.warning(content),
        info: (content: string) => message.info(content),
      },
      notification: {
        success: (options: Parameters<typeof notification.success>[0]) =>
          notification.success(options),
        error: (options: Parameters<typeof notification.error>[0]) => notification.error(options),
        warning: (options: Parameters<typeof notification.warning>[0]) =>
          notification.warning(options),
        info: (options: Parameters<typeof notification.info>[0]) => notification.info(options),
      },
      modal,
    };
  }, []);

  const mergedEventContext = useMemo<EventContext>(() => {
    const providedUi: EventUIContext = eventContext?.ui ?? {};
    return {
      ...eventContext,
      ui: {
        message: providedUi.message ?? uiContext.message,
        notification: providedUi.notification ?? uiContext.notification,
        modal: providedUi.modal ?? uiContext.modal,
        openTab: providedUi.openTab,
      },
    };
  }, [eventContext, uiContext]);

  // Use ref to store mode for event listener (avoid rebinding on mode change)
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Handle Esc key to exit preview mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modeRef.current === 'preview') {
        setMode('edit');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Selection store integration
  const selectedId = useSelectionStore((state) => state.selectedId);
  const selectComponent = useSelectionStore((state) => state.selectComponent);

  // 浮动岛快捷键
  useFloatingIslandHotkey();

  // 处理组件选择
  const handleSelectComponent = useCallback(
    (id: string) => {
      selectComponent(id);
    },
    [selectComponent],
  );

  const handleSchemaUpdate = useCallback(
    (newSchema: A2UISchema) => {
      setSchema(newSchema);
      onChange?.(newSchema);
    },
    [onChange],
  );

  const { updateSchema, forceUpdateSchema, undo, redo, canUndo, canRedo, historySize } =
    useSchemaHistoryStore(schema, handleSchemaUpdate, {
      enableMerge: true,
      mergeWindow: 500,
    });

  // 处理 Schema 变化（记录历史）
  const handleSchemaChange = useCallback(
    (newSchema: A2UISchema) => {
      updateSchema(newSchema, '更新 Schema');
    },
    [updateSchema],
  );

  const handleSchemaCommit = useCallback(
    (newSchema: A2UISchema) => {
      forceUpdateSchema(newSchema, '保存 Schema');
    },
    [forceUpdateSchema],
  );

  useUndoRedoShortcuts({ onUndo: undo, onRedo: redo });

  // 处理编译
  const handleCompile = useCallback(async () => {
    if (schema) {
      try {
        const code = await compileSchema(schema);
        setCompiledCode(code);
        message.success('编译成功！');
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : '未知错误';
        console.error(e);
        message.error('编译失败：' + errorMessage);
        setCompiledCode(null);
      }
    } else {
      message.warning('Schema 为空，无法编译');
      setCompiledCode(null);
    }
  }, [schema]);

  // 处理AI生成的Schema更新
  const handleAISchemaUpdate = useCallback(
    (newSchema: A2UISchema) => {
      forceUpdateSchema(newSchema, 'AI 更新 Schema');
      message.success('Schema 已更新！');
    },
    [forceUpdateSchema],
  );

  // 处理模板应用
  const handleApplyTemplate = useCallback(
    (templateSchema: A2UISchema) => {
      forceUpdateSchema(templateSchema, '应用模板');
      message.success('模板已应用！');
    },
    [forceUpdateSchema],
  );

  // 合并自定义组件与默认注册表
  const allComponents = useMemo(() => {
    const componentsOnly = Object.keys(componentRegistry).reduce(
      (acc, key) => {
        acc[key] = componentRegistry[key].component;
        return acc;
      },
      {} as Record<string, React.ComponentType<Record<string, unknown>>>,
    );
    return { ...componentsOnly, ...customComponents };
  }, [customComponents]);

  const isPreviewMode = mode === 'preview';

  // 参考 lowcode 项目的简洁布局
  return (
    <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm }}>
      <div className={`${styles.lowcodeEditor} ${isPreviewMode ? styles.previewMode : ''}`}>
        {/* Header - 预览模式下隐藏 */}
        <AnimatePresence>
          {!isPreviewMode && (
            <motion.div
              initial={{ y: -60 }}
              animate={{ y: 0 }}
              exit={{ y: -60 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className={styles.headerWrapper}
            >
              <EditorHeader
                onCompile={handleCompile}
                previewTheme={previewTheme}
                onThemeChange={setPreviewTheme}
                mode={mode}
                onModeChange={setMode}
                onUndo={undo}
                onRedo={redo}
                canUndo={canUndo}
                canRedo={canRedo}
                historySize={historySize}
                onApplyTemplate={handleApplyTemplate}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* 三栏布局 - 预览模式下隐藏侧边栏 */}
        <div className={styles.mainLayout}>
          {/* 左侧：组件树 */}
          <AnimatePresence>
            {!isPreviewMode && (
              <motion.aside
                initial={{ x: -300 }}
                animate={{ x: 0 }}
                exit={{ x: -300 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className={styles.leftSidebar}
              >
                <ComponentTree
                  schema={schema}
                  selectedId={selectedId}
                  onSelect={handleSelectComponent}
                  onSchemaChange={handleSchemaChange}
                />
              </motion.aside>
            )}
          </AnimatePresence>

          {/* 中间：预览区域 */}
          <main className={`${styles.centerPane} ${isPreviewMode ? styles.fullWidth : ''}`}>
            <PreviewPane
              schema={schema}
              allComponents={allComponents}
              eventContext={mergedEventContext}
              previewTheme={previewTheme}
              isPreviewMode={isPreviewMode}
              compiledCode={compiledCode}
              onSchemaChange={handleSchemaChange}
              onSchemaCommit={handleSchemaCommit}
            />
          </main>

          {/* 右侧：属性面板 */}
          <AnimatePresence>
            {!isPreviewMode && (
              <motion.aside
                initial={{ x: 350 }}
                animate={{ x: 0 }}
                exit={{ x: 350 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className={styles.rightSidebar}
              >
                <PropertyPanel
                  schema={schema}
                  selectedId={selectedId}
                  onSchemaChange={handleSchemaChange}
                />
              </motion.aside>
            )}
          </AnimatePresence>
        </div>

        {/* AI 浮动岛 - 预览模式下隐藏 (与 mainLayout 同级，不受容器限制) */}
        <AnimatePresence>
          {!isPreviewMode && (
            <FloatingIsland
              currentSchema={schema}
              onSchemaUpdate={handleAISchemaUpdate}
              onError={onError}
              isPreviewMode={isPreviewMode}
            />
          )}
        </AnimatePresence>

        {/* AI 历史抽屉 - 预览模式下隐藏 */}
        <AnimatePresence>{!isPreviewMode && <HistoryDrawer />}</AnimatePresence>

        {/* 浮动退出预览按钮 */}
        <AnimatePresence>
          {isPreviewMode && (
            <motion.div
              initial={{ y: -50, opacity: 0, x: '-50%' }}
              animate={{ y: 20, opacity: 1, x: '-50%' }}
              exit={{ y: -50, opacity: 0, x: '-50%' }}
              transition={{ duration: 0.3, ease: 'backOut' }}
              className={styles.floatingPreviewBar}
            >
              <div className={styles.previewStatus}>
                <div className={styles.statusDot} />
                <span className={styles.statusText}>预览模式</span>
              </div>
              <div className={styles.divider} />
              <button onClick={() => setMode('edit')} className={styles.exitPreviewButton}>
                <X size={14} />
                退出预览 (Esc)
              </button>
              <button
                onClick={() => window.open('/preview', '_blank')}
                className={styles.newTabButton}
              >
                <ExternalLink size={14} />
                新标签页打开
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ConfigProvider>
  );
}

/**
 * JSON Schema 编辑器，支持实时预览
 * 使用 ErrorBoundary 包裹以捕获渲染错误
 */
export function LowcodeEditor(props: LowcodeEditorProps) {
  return (
    <ErrorBoundary>
      <LowcodeEditorInner {...props} />
    </ErrorBoundary>
  );
}
