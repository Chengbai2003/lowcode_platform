import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { ConfigProvider, theme, message, notification, Modal } from 'antd';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink } from 'lucide-react';
import type {
  EventContext,
  EventUIContext,
  LowcodeEditorProps,
  NotificationOptions,
  PageSchema,
} from './types';
import type { AIMessageActionResult } from '../types';
import { componentRegistry } from '../components';
import { antdPreset } from '@lowcode-platform/preset-antd';
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
import { useSelectionStore, useEditorStore } from './store/editor-store';
import { createDefaultReactiveSchema } from './templates/reactiveSchema';
import styles from './LowcodeEditor.module.scss';
import { usePageLifecycle } from './hooks/usePageLifecycle';
import { useAIPatch } from './hooks/useAIPatch';
import { useEditorActions } from './hooks/useEditorActions';
import {
  applyComponentSnapshot as applyComponentSnapshotPure,
  extractSchemaSnapshot,
} from './services/schemaSync';

/**
 * 编辑器内部组件
 */
function LowcodeEditorInner({
  pageId,
  projectName,
  initialSchema,
  onChange,
  onError,
  eventContext = {},
}: LowcodeEditorProps) {
  // 初始化 Schema
  const defaultSchema: PageSchema = useMemo(() => createDefaultReactiveSchema(), []);

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

  const [schema, setSchema] = useState<PageSchema>(initialSchemaObj);
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>('light');
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [compiledCode, setCompiledCode] = useState<string | null>(null);
  const [pageVersion, setPageVersion] = useState<number | null>(null);

  // ponytail ultra: pageVersionRef 稳定化，避免 pageVersion 抖动触发重请求；
  // Schema 不再携带页面版本（M0-1），无需 schemaVersionRef
  const pageVersionRef = useRef(pageVersion);
  useEffect(() => {
    pageVersionRef.current = pageVersion;
  }, [pageVersion]);

  // P0-5 TOCTOU atomic: mounted guard for unmount race + schema ref to avoid closure stale
  const mountedRef = useRef(true);
  const schemaRef = useRef(schema);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    schemaRef.current = schema;
  }, [schema]);

  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

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
        success: (options: NotificationOptions) =>
          notification.success(options as Parameters<typeof notification.success>[0]),
        error: (options: NotificationOptions) =>
          notification.error(options as Parameters<typeof notification.error>[0]),
        warning: (options: NotificationOptions) =>
          notification.warning(options as Parameters<typeof notification.warning>[0]),
        info: (options: NotificationOptions) =>
          notification.info(options as Parameters<typeof notification.info>[0]),
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
    (newSchema: PageSchema) => {
      setSchema(newSchema);
      useEditorStore.getState().bumpSchemaRevision();
      onChange?.(newSchema);
    },
    [onChange],
  );

  const {
    updateSchema,
    forceUpdateSchema,
    executeSchemaCommand,
    undo,
    redo,
    canUndo,
    canRedo,
    historySize,
  } = useSchemaHistoryStore(schema, handleSchemaUpdate, {
    enableMerge: true,
    mergeWindow: 500,
  });

  // 处理 Schema 变化（记录历史）
  const handleSchemaChange = useCallback(
    (newSchema: PageSchema) => {
      useEditorStore.getState().bumpSchemaRevision();
      updateSchema(newSchema, '更新 Schema');
    },
    [updateSchema],
  );

  const handleSchemaCommit = useCallback(
    (newSchema: PageSchema) => {
      useEditorStore.getState().bumpSchemaRevision();
      forceUpdateSchema(newSchema, '保存 Schema');
    },
    [forceUpdateSchema],
  );

  useUndoRedoShortcuts({ onUndo: undo, onRedo: redo });

  usePageLifecycle({
    pageId,
    initialSchemaObj,
    setSchema,
    setPageVersion,
    onErrorRef,
  });

  const { handleSavePage, handleCompile, isPageSaving } = useEditorActions({
    pageId,
    schema,
    pageVersion,
    setPageVersion,
    setSchema,
    setCompiledCode,
    onError,
  });
  // 处理模板应用
  const handleApplyTemplate = useCallback(
    (templateSchema: PageSchema) => {
      forceUpdateSchema(templateSchema, '应用模板');
      message.success('模板已应用！');
    },
    [forceUpdateSchema],
  );

  // 获取当前 documentSessionId 并计算唯一页面身份（未保存草稿使用 draft:${sessionId}，禁止固定 default-page）
  const documentSessionId = useSelectionStore((state) => state.documentSessionId);
  const runtimePageId = pageId ?? `draft:${documentSessionId}`;

  // 内置 Preset 是编辑器唯一的 Preview/Compiler 组件集合。
  const editorPreset = antdPreset;

  // 内置组件注册表供属性面板/左侧面板使用。
  const allComponents = useMemo(() => {
    const rendererComponents = { ...antdPreset.runtime };
    const componentsOnly = Object.keys(componentRegistry).reduce(
      (acc, key) => {
        acc[key] = componentRegistry[key].component;
        return acc;
      },
      {} as Record<string, React.ComponentType<Record<string, unknown>>>,
    );
    return { ...rendererComponents, ...componentsOnly };
  }, []);

  const { handleAISchemaUpdate, handleAIPatchApply } = useAIPatch({
    allComponents,
    handleSchemaUpdate,
    forceUpdateSchema,
    executeSchemaCommand,
    schemaRef,
    pageVersionRef,
    mountedRef,
    selectComponent,
    onError,
  });

  // Helpers moved to services/schemaSync.ts — isA2UISchema / extractSchemaSnapshot / buildSubtreeSchema / applyComponentSnapshotPure
  const applyComponentSnapshot = useCallback(
    (snapshot: PageSchema, componentId: string) =>
      applyComponentSnapshotPure(schema, snapshot, componentId),
    [schema],
  );

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
                projectName={projectName}
                pageId={pageId}
                pageVersion={pageVersion}
                onCompile={handleCompile}
                onSave={handleSavePage}
                isSaving={isPageSaving}
                canSave={Boolean(pageId)}
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
              preset={editorPreset}
              pageId={runtimePageId}
              documentSessionId={documentSessionId}
              allComponents={allComponents}
              eventContext={mergedEventContext}
              previewTheme={previewTheme}
              selectedId={selectedId}
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
              pageId={pageId}
              pageVersion={pageVersion}
              selectedId={selectedId}
              onSchemaUpdate={handleAISchemaUpdate}
              onPatchApply={handleAIPatchApply}
              onError={onError}
              isPreviewMode={isPreviewMode}
            />
          )}
        </AnimatePresence>

        {/* AI 历史抽屉 - 预览模式下隐藏 */}
        <AnimatePresence>
          {!isPreviewMode && (
            <HistoryDrawer
              onRollback={(nextSchema) => {
                const snapshot = extractSchemaSnapshot(nextSchema);
                if (!snapshot) {
                  message.error('该历史记录缺少可应用的 Schema 数据');
                  return false;
                }

                const actionResult = nextSchema as Partial<AIMessageActionResult>;
                if (actionResult?.componentId && snapshot.rootId === actionResult.componentId) {
                  const merged = applyComponentSnapshot(snapshot, actionResult.componentId);
                  if (!merged) {
                    message.error('未找到对应组件，无法应用历史记录');
                    return false;
                  }
                  return handleAISchemaUpdate(merged);
                }

                return handleAISchemaUpdate(snapshot);
              }}
            />
          )}
        </AnimatePresence>

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
 * ponytail ultra: key 移至 ErrorBoundary 以在 document 切换时清除错误边界状态；Inner 内同步 reset 避免 generation 竞态
 */
export function LowcodeEditor(props: LowcodeEditorProps) {
  const legacyComponents = (props as { components?: unknown }).components;
  const hasUnsupportedCustomComponents =
    legacyComponents !== undefined &&
    (typeof legacyComponents !== 'object' ||
      legacyComponents === null ||
      Object.keys(legacyComponents).length > 0);

  if (hasUnsupportedCustomComponents) {
    throw new Error(
      'LowcodeEditor does not support custom components until the backend registers their SystemRuntimeProfile.',
    );
  }
  const documentKey = `doc::${props.pageId ?? '__local'}`;
  return (
    <ErrorBoundary key={documentKey}>
      <LowcodeEditorInner {...props} />
    </ErrorBoundary>
  );
}
