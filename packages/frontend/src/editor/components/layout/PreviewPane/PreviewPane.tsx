import React, { useState, useCallback, useEffect, useRef } from 'react';
import Editor, { useMonaco, type OnMount } from '@monaco-editor/react';
import type { ComponentRegistry, A2UISchema, A2UIComponent } from '../../../../types';
import { SelectableCanvas } from './SelectableCanvas';
import { NoSchemaEmptyState } from '../../EmptyState';
import styles from './PreviewPane.module.scss';

/**
 * A2UISchema 运行时校验
 * 确保用户编辑的 JSON 符合基本的 schema 结构
 */
function isValidA2UISchema(data: unknown): data is A2UISchema {
  if (!data || typeof data !== 'object') return false;

  const obj = data as Record<string, unknown>;

  // 检查 rootId
  if (typeof obj.rootId !== 'string') return false;

  // 检查 components
  if (typeof obj.components !== 'object' || obj.components === null) return false;

  const components = obj.components as Record<string, unknown>;
  const rootId = obj.rootId as string;

  // 检查根组件是否存在
  if (!components[rootId]) return false;

  // 检查每个组件的基本结构
  for (const [id, comp] of Object.entries(components)) {
    if (!comp || typeof comp !== 'object') return false;

    const component = comp as Record<string, unknown>;

    // 检查 id 匹配
    if (component.id !== id) return false;

    // 检查 type
    if (typeof component.type !== 'string') return false;

    // 检查 childrenIds (如果存在)
    if (component.childrenIds !== undefined) {
      if (!Array.isArray(component.childrenIds)) return false;

      // 验证所有子组件 ID 是否存在于 components 中
      for (const childId of component.childrenIds) {
        if (typeof childId !== 'string' || !components[childId]) {
          return false;
        }
      }
    }
  }

  return true;
}

/**
 * 类型守卫错误信息
 */
class SchemaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaValidationError';
  }
}

/**
 * 校验并转换 JSON 字符串为 A2UISchema
 */
function parseAndValidateSchema(jsonString: string): A2UISchema {
  const parsed = JSON.parse(jsonString);

  if (!isValidA2UISchema(parsed)) {
    throw new SchemaValidationError(
      '无效的 A2UI Schema 格式：缺少必要的 rootId 或 components 字段，或组件结构不完整',
    );
  }

  return parsed;
}

interface PreviewPaneProps {
  schema: A2UISchema | null;
  allComponents: ComponentRegistry;
  eventContext: Record<string, unknown>;
  previewTheme: 'light' | 'dark';
  isPreviewMode?: boolean;
  compiledCode?: string | null;
  onSchemaChange?: (schema: A2UISchema) => void;
}

type ActiveTab = 'preview' | 'json' | 'compiled';

export const PreviewPane: React.FC<PreviewPaneProps> = ({
  schema,
  allComponents,
  eventContext,
  previewTheme,
  isPreviewMode,
  compiledCode,
  onSchemaChange,
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('preview');
  const [editedJson, setEditedJson] = useState<string>('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const monaco = useMonaco();
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const editedJsonRef = useRef<string>('');
  const hasUnsavedChangesRef = useRef(false);

  // 同步 ref 和 state
  useEffect(() => {
    editedJsonRef.current = editedJson;
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [editedJson, hasUnsavedChanges]);

  // 将 schema 转换为可展示的 JSON 格式
  const getDisplayJson = useCallback(() => {
    if (!schema) return '{}';
    const { rootId, components } = schema;
    return JSON.stringify({ rootId, components }, null, 2);
  }, [schema]);

  // 当 schema 变化或切换到 JSON tab 时，重置编辑内容
  useEffect(() => {
    if (activeTab === 'json') {
      const json = getDisplayJson();
      setEditedJson(json);
      setHasUnsavedChanges(false);
    }
  }, [activeTab, getDisplayJson]);

  // 处理 JSON 编辑
  const handleJsonChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      setEditedJson(value);
      setHasUnsavedChanges(true);
      editedJsonRef.current = value;
      hasUnsavedChangesRef.current = true;
    }
  }, []);

  // 保存 JSON (Ctrl/Cmd + S)
  const handleSaveJson = useCallback(() => {
    // 使用 ref 获取最新值，避免闭包陷阱
    if (!hasUnsavedChangesRef.current) {
      return;
    }
    try {
      const parsed = parseAndValidateSchema(editedJsonRef.current);
      onSchemaChange?.(parsed);
      setHasUnsavedChanges(false);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'JSON 格式错误';
      alert(`保存失败：${errorMessage}`);
    }
  }, [onSchemaChange]);

  // Editor 挂载时注册 Ctrl/Cmd + S 快捷键
  const handleEditorMount: OnMount = useCallback(
    (editor, monacoInstance) => {
      editorRef.current = editor;

      if (!monacoInstance) return;

      // 注册 Ctrl/Cmd + S 快捷键
      editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => {
        // 直接使用 ref 调用保存逻辑，避免闭包陷阱
        if (!hasUnsavedChangesRef.current) {
          return;
        }
        try {
          const parsed = parseAndValidateSchema(editedJsonRef.current);
          onSchemaChange?.(parsed);
          setHasUnsavedChanges(false);
          hasUnsavedChangesRef.current = false;
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : 'JSON 格式错误';
          alert(`保存失败：${errorMessage}`);
        }
      });
    },
    [onSchemaChange],
  );

  // 切换到编译代码 Tab 时的检查
  const handleCompiledTabClick = () => {
    if (!compiledCode) {
      return; // 没有编译代码时不切换
    }
    setActiveTab('compiled');
  };

  return (
    <div className={styles.previewPaneWrapper}>
      {/* Tab 切换栏 - 预览模式下隐藏 */}
      {!isPreviewMode && (
        <div className={styles.tabBar}>
          <button
            className={`${styles.tabButton} ${activeTab === 'preview' ? styles.active : ''}`}
            onClick={() => setActiveTab('preview')}
          >
            实时预览
          </button>
          <button
            className={`${styles.tabButton} ${activeTab === 'json' ? styles.active : ''}`}
            onClick={() => setActiveTab('json')}
          >
            JSON
          </button>
          <button
            className={`${styles.tabButton} ${activeTab === 'compiled' ? styles.active : ''} ${!compiledCode ? styles.disabled : ''}`}
            onClick={handleCompiledTabClick}
            disabled={!compiledCode}
            title={!compiledCode ? '请先点击编译按钮' : '查看编译后的 React 代码'}
          >
            React 代码
            {compiledCode && <span className={styles.compiledBadge}>新</span>}
          </button>
        </div>
      )}

      {/* 内容区域 */}
      <div
        className={`${styles.previewContainer} ${activeTab === 'preview' || isPreviewMode ? styles.previewView : styles.codeView}`}
      >
        {(activeTab === 'preview' || isPreviewMode) && (
          <SelectableCanvas
            schema={schema}
            allComponents={allComponents}
            eventContext={eventContext}
            isPreviewMode={isPreviewMode}
          />
        )}

        {activeTab === 'json' && schema && (
          <div className={styles.editorContainer}>
            <div className={styles.jsonEditorHeader}>
              <span className={styles.saveHint}>
                {hasUnsavedChanges ? (
                  <span className={styles.unsaved}>
                    <span className={styles.dot} /> 按 Ctrl+S 保存修改
                  </span>
                ) : (
                  <span className={styles.saved}>已同步</span>
                )}
              </span>
            </div>
            <Editor
              height="100%"
              defaultLanguage="json"
              theme={previewTheme === 'dark' ? 'vs-dark' : 'light'}
              value={editedJson}
              onChange={handleJsonChange}
              onMount={handleEditorMount}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                padding: { top: 16, bottom: 16 },
                readOnly: false,
                lineNumbers: 'on',
                renderWhitespace: 'selection',
                fontFamily: 'JetBrains Mono, Consolas, Monaco, monospace',
              }}
            />
          </div>
        )}

        {activeTab === 'json' && !schema && <NoSchemaEmptyState />}

        {activeTab === 'compiled' && compiledCode && (
          <div className={styles.editorContainer}>
            <Editor
              height="100%"
              defaultLanguage="typescript"
              theme={previewTheme === 'dark' ? 'vs-dark' : 'light'}
              value={compiledCode}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                padding: { top: 16, bottom: 16 },
                readOnly: true,
                lineNumbers: 'on',
                renderWhitespace: 'selection',
                fontFamily: 'JetBrains Mono, Consolas, Monaco, monospace',
              }}
            />
          </div>
        )}

        {activeTab === 'compiled' && !compiledCode && (
          <div className={styles.emptyCompiledState}>
            <div className={styles.emptyStateIcon}>
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <h3 className={styles.emptyStateTitle}>暂无编译代码</h3>
            <p className={styles.emptyStateDescription}>请点击顶部「编译」按钮生成 React 代码</p>
          </div>
        )}
      </div>
    </div>
  );
};
