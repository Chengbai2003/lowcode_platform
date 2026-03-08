import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { ConfigProvider, theme, message } from 'antd';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink } from 'lucide-react';
import type { LowcodeEditorProps } from './types';
import type { A2UISchema } from '../types';
import { componentRegistry } from '../components';
import { compileSchema } from './services/compilerApi';
import { EditorHeader, PreviewPane, PropertyPanel, ErrorBoundary } from './components';
import { ComponentTree } from './components/TreeView/ComponentTree';
import { useFloatingIslandHotkey } from './hooks/useFloatingIslandHotkey';
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

  // 处理 Schema 变化
  const handleSchemaChange = useCallback(
    (newSchema: A2UISchema) => {
      setSchema(newSchema);
      onChange?.(newSchema);
    },
    [onChange],
  );

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
      setSchema(newSchema);
      onChange?.(newSchema);
      message.success('Schema 已更新！');
    },
    [onChange],
  );

  // 处理历史回滚
  const handleRollback = useCallback(
    (actionResult: unknown) => {
      if (actionResult && schema) {
        message.info('回滚功能需要完整实现 actionResult 解析');
      }
    },
    [schema],
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
                onUndo={() => message.info('撤销功能')}
                onRedo={() => message.info('重做功能')}
                canUndo={false}
                canRedo={false}
                historySize={0}
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
              eventContext={eventContext}
              previewTheme={previewTheme}
              isPreviewMode={isPreviewMode}
              compiledCode={compiledCode}
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
        <AnimatePresence>
          {!isPreviewMode && <HistoryDrawer onRollback={handleRollback} />}
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
