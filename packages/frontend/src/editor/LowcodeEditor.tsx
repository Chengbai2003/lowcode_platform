import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { ConfigProvider, theme, message, notification, Modal } from 'antd';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink } from 'lucide-react';
import type {
  EventContext,
  EventUIContext,
  LowcodeEditorProps,
  NotificationOptions,
} from './types';
import type { A2UISchema, A2UIComponent, AIMessageActionResult } from '../types';
import { componentRegistry } from '../components';
import { builtInComponents } from '../renderer';
import { validateAndAutoFixA2UISchema } from '../schema/schemaValidation';
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
import { createPatchCommand } from './commands/schemaCommands';
import { FloatingIsland } from './components/ai-assistant/FloatingIsland';
import { HistoryDrawer } from './components/ai-assistant/HistoryDrawer';
import { useSelectionStore } from './store/editor-store';
import { createDefaultReactiveSchema } from './templates/reactiveSchema';
import { pageSchemaApi } from './services/pageSchemaApi';
import type { AgentPatchApplyPayload } from './components/ai-assistant/types/ai-types';
import styles from './LowcodeEditor.module.scss';

/**
 * 编辑器内部组件
 */
function LowcodeEditorInner({
  pageId,
  projectName,
  initialSchema,
  components: customComponents = {},
  onChange,
  onError,
  eventContext = {},
}: LowcodeEditorProps) {
  // 初始化 Schema
  const defaultSchema: A2UISchema = useMemo(() => createDefaultReactiveSchema(), []);

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
  const [pageVersion, setPageVersion] = useState<number | null>(null);
  const [isPageSaving, setIsPageSaving] = useState(false);

  const syncSchemaVersion = useCallback(
    (nextSchema: A2UISchema, targetVersion?: number | null): A2UISchema => {
      const resolvedVersion = targetVersion ?? pageVersion ?? schema.version ?? nextSchema.version;
      if (resolvedVersion === undefined) {
        return nextSchema;
      }

      return {
        ...nextSchema,
        version: resolvedVersion,
      };
    },
    [pageVersion, schema.version],
  );

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
    (newSchema: A2UISchema) => {
      const normalizedSchema = syncSchemaVersion(newSchema);
      setSchema(normalizedSchema);
      onChange?.(normalizedSchema);
    },
    [onChange, syncSchemaVersion],
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
    (newSchema: A2UISchema) => {
      updateSchema(syncSchemaVersion(newSchema), '更新 Schema');
    },
    [syncSchemaVersion, updateSchema],
  );

  const handleSchemaCommit = useCallback(
    (newSchema: A2UISchema) => {
      forceUpdateSchema(syncSchemaVersion(newSchema), '保存 Schema');
    },
    [forceUpdateSchema, syncSchemaVersion],
  );

  useUndoRedoShortcuts({ onUndo: undo, onRedo: redo });

  useEffect(() => {
    let cancelled = false;

    if (!pageId) {
      return () => {
        cancelled = true;
      };
    }

    pageSchemaApi
      .getPageSchema(pageId)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setSchema(syncSchemaVersion(result.schema, result.version));
        setPageVersion(result.version);
      })
      .catch(async (error: unknown) => {
        if (cancelled) {
          return;
        }

        const status =
          typeof error === 'object' && error ? (error as { status?: number }).status : undefined;
        if (status === 404) {
          try {
            const bootstrapResult = await pageSchemaApi.savePageSchema(pageId, initialSchemaObj);
            if (cancelled) {
              return;
            }
            setSchema(syncSchemaVersion(initialSchemaObj, bootstrapResult.version));
            setPageVersion(bootstrapResult.version);
            message.info(`已为页面 ${pageId} 初始化默认 Schema`);
          } catch (bootstrapError) {
            const errorMessage =
              bootstrapError instanceof Error ? bootstrapError.message : '页面初始化失败';
            onError?.(errorMessage);
            message.error(errorMessage);
          }
          return;
        }

        const errorMessage = error instanceof Error ? error.message : '页面加载失败';
        onError?.(errorMessage);
        message.error('页面加载失败，已回退到本地初始内容');
      });

    return () => {
      cancelled = true;
    };
  }, [initialSchemaObj, onError, pageId, syncSchemaVersion]);

  const handleSavePage = useCallback(async () => {
    if (!pageId || isPageSaving) {
      return;
    }

    setIsPageSaving(true);
    try {
      const schemaToSave = syncSchemaVersion(schema);
      const result = await pageSchemaApi.savePageSchema(
        pageId,
        schemaToSave,
        pageVersion ?? undefined,
      );
      setPageVersion(result.version);
      setSchema((currentSchema) => syncSchemaVersion(currentSchema, result.version));
      message.success(`页面已保存，当前版本 v${result.version}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '页面保存失败';
      message.error(errorMessage);
    } finally {
      setIsPageSaving(false);
    }
  }, [isPageSaving, pageId, pageVersion, schema, syncSchemaVersion]);

  // 处理编译
  const handleCompile = useCallback(async () => {
    if (schema) {
      try {
        const code = await compileSchema(schema);
        setCompiledCode(code);
        message.success('编译成功！');
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : '未知错误';
        onError?.(errorMessage);
        message.error('编译失败：' + errorMessage);
        setCompiledCode(null);
      }
    } else {
      message.warning('Schema 为空，无法编译');
      setCompiledCode(null);
    }
  }, [schema]);
  // 处理模板应用
  const handleApplyTemplate = useCallback(
    (templateSchema: A2UISchema) => {
      forceUpdateSchema(syncSchemaVersion(templateSchema), '应用模板');
      message.success('模板已应用！');
    },
    [forceUpdateSchema, syncSchemaVersion],
  );

  // 合并自定义组件与默认注册表
  const allComponents = useMemo(() => {
    const rendererComponents = { ...builtInComponents };
    const componentsOnly = Object.keys(componentRegistry).reduce(
      (acc, key) => {
        acc[key] = componentRegistry[key].component;
        return acc;
      },
      {} as Record<string, React.ComponentType<Record<string, unknown>>>,
    );
    return { ...rendererComponents, ...componentsOnly, ...customComponents };
  }, [customComponents]);

  const handleAISchemaUpdate = useCallback(
    (newSchema: A2UISchema) => {
      const whitelist = Object.keys(allComponents);
      const result = validateAndAutoFixA2UISchema(newSchema, whitelist);

      if (!result.success) {
        const errorMessage = result.error.issues[0]?.message || 'Schema 校验失败';
        onError?.(errorMessage);
        message.error(`AI Schema 无法应用：${errorMessage}`);
        return false;
      }

      if (result.fixes.length > 0) {
        message.info(`已自动修复 ${result.fixes.length} 处 Schema 问题`);
      }

      forceUpdateSchema(syncSchemaVersion(result.data), 'AI 更新 Schema');
      message.success('Schema 已更新！');
      return true;
    },
    [allComponents, forceUpdateSchema, onError, syncSchemaVersion],
  );

  const describeAIPatch = useCallback((instruction: string, patchCount: number) => {
    const trimmed = instruction.trim();
    const summary = trimmed.length > 24 ? `${trimmed.slice(0, 24)}...` : trimmed;
    return patchCount > 0 ? `AI 修改：${summary || '应用 patch'}` : 'AI 修改';
  }, []);

  const handleAIPatchApply = useCallback(
    async ({
      instruction,
      patch,
      resolvedSelectedId,
      warnings,
    }: AgentPatchApplyPayload): Promise<A2UISchema | null> => {
      try {
        const baseSchema = syncSchemaVersion(schema);
        const command = createPatchCommand(
          baseSchema,
          patch,
          handleSchemaUpdate,
          describeAIPatch(instruction, patch.length),
        );

        executeSchemaCommand(command);
        const nextSchema = command.getNewSchema();

        if (resolvedSelectedId && nextSchema.components[resolvedSelectedId]) {
          selectComponent(resolvedSelectedId);
        }

        if (warnings && warnings.length > 0) {
          message.info(`AI 修改已应用，并返回 ${warnings.length} 条提示`);
        }

        return nextSchema;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'AI patch 应用失败';
        onError?.(errorMessage);
        message.error(errorMessage);
        return null;
      }
    },
    [
      describeAIPatch,
      executeSchemaCommand,
      handleSchemaUpdate,
      onError,
      schema,
      selectComponent,
      syncSchemaVersion,
    ],
  );

  const isA2UISchema = (value: unknown): value is A2UISchema => {
    if (!value || typeof value !== 'object') return false;
    return 'rootId' in value && 'components' in value;
  };

  const extractSchemaSnapshot = (value: unknown): A2UISchema | null => {
    if (isA2UISchema(value)) {
      return value;
    }
    if (!value || typeof value !== 'object') return null;
    const actionResult = value as Partial<AIMessageActionResult>;
    if (isA2UISchema(actionResult.schemaSnapshot)) {
      return actionResult.schemaSnapshot;
    }
    const maybeProps = (actionResult as { props?: unknown }).props;
    if (isA2UISchema(maybeProps)) {
      return maybeProps;
    }
    return null;
  };

  const buildSubtreeSchema = (source: A2UISchema, rootId: string): A2UISchema | null => {
    const root = source.components[rootId];
    if (!root) return null;

    const components: Record<string, A2UIComponent> = {};
    const stack = [rootId];

    while (stack.length > 0) {
      const id = stack.pop()!;
      if (components[id]) continue;
      const node = source.components[id];
      if (!node) continue;
      components[id] = node;
      if (Array.isArray(node.childrenIds)) {
        for (const childId of node.childrenIds) {
          if (typeof childId === 'string' && source.components[childId]) {
            stack.push(childId);
          }
        }
      }
    }

    return { rootId, components };
  };

  const applyComponentSnapshot = (snapshot: A2UISchema, componentId: string): A2UISchema | null => {
    if (!schema.components[componentId]) return null;

    const subtree =
      snapshot.rootId === componentId ? snapshot : buildSubtreeSchema(snapshot, componentId);
    if (!subtree) return null;
    if (!subtree.components[subtree.rootId]) return null;

    const toRemove = new Set<string>();
    const stack = [componentId];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (toRemove.has(id)) continue;
      toRemove.add(id);
      const node = schema.components[id];
      if (!node?.childrenIds) continue;
      for (const childId of node.childrenIds) {
        if (typeof childId === 'string' && schema.components[childId]) {
          stack.push(childId);
        }
      }
    }

    const nextComponents = { ...schema.components };
    for (const id of toRemove) {
      delete nextComponents[id];
    }
    for (const [id, comp] of Object.entries(subtree.components)) {
      nextComponents[id] = comp;
    }

    return {
      ...schema,
      components: nextComponents,
    };
  };

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
 */
export function LowcodeEditor(props: LowcodeEditorProps) {
  return (
    <ErrorBoundary>
      <LowcodeEditorInner {...props} />
    </ErrorBoundary>
  );
}
