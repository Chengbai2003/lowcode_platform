import React, { useState, useCallback, useEffect, useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { ComponentRegistry, A2UISchema } from '../../../../types';
import { validateA2UISchemaWithWhitelist } from '../../../../schema/schemaValidation';
import { SelectableCanvas } from './SelectableCanvas';
import { NoSchemaEmptyState } from '../../EmptyState';
import styles from './PreviewPane.module.scss';

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
function parseAndValidateSchema(jsonString: string, whitelist: string[]): A2UISchema {
  const parsed = JSON.parse(jsonString);
  const result = validateA2UISchemaWithWhitelist(parsed, whitelist);

  if (!result.success) {
    throw new SchemaValidationError(result.error.issues[0]?.message || '无效的 A2UI Schema');
  }

  return result.data;
}

interface PreviewPaneProps {
  schema: A2UISchema | null;
  allComponents: ComponentRegistry;
  eventContext: Record<string, unknown>;
  previewTheme: 'light' | 'dark';
  selectedId?: string | null;
  isPreviewMode?: boolean;
  compiledCode?: string | null;
  onSchemaChange?: (schema: A2UISchema) => void;
  onSchemaCommit?: (schema: A2UISchema) => void;
}

type ActiveTab = 'preview' | 'json' | 'compiled';

export const PreviewPane: React.FC<PreviewPaneProps> = ({
  schema,
  allComponents,
  eventContext,
  previewTheme,
  selectedId,
  isPreviewMode,
  compiledCode,
  onSchemaChange,
  onSchemaCommit,
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('preview');
  const [editedJson, setEditedJson] = useState<string>('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const editedJsonRef = useRef<string>('');
  const hasUnsavedChangesRef = useRef(false);
  const saveWhitelistRef = useRef<string[]>(Object.keys(allComponents));
  const onSchemaCommitRef = useRef(onSchemaCommit);
  const onSchemaChangeRef = useRef(onSchemaChange);
  const jsonEditorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const selectionDecorationIdsRef = useRef<string[]>([]);

  useEffect(() => {
    editedJsonRef.current = editedJson;
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [editedJson, hasUnsavedChanges]);

  useEffect(() => {
    saveWhitelistRef.current = Object.keys(allComponents);
  }, [allComponents]);

  useEffect(() => {
    onSchemaCommitRef.current = onSchemaCommit;
    onSchemaChangeRef.current = onSchemaChange;
  }, [onSchemaChange, onSchemaCommit]);

  // 将 schema 转换为可展示的 JSON 格式
  const getDisplayJson = useCallback(() => {
    if (!schema) return '{}';
    const { version, rootId, components } = schema;
    return JSON.stringify({ version, rootId, components }, null, 2);
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

  const findBalancedObjectEnd = useCallback((source: string, braceStartIndex: number) => {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = braceStartIndex; index < source.length; index += 1) {
      const char = source[index];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          return index;
        }
      }
    }

    return -1;
  }, []);

  const findComponentJsonRange = useCallback(
    (jsonString: string, componentId: string) => {
      const componentsAnchor = jsonString.indexOf('"components": {');
      if (componentsAnchor < 0) {
        return null;
      }

      const componentKey = `"${componentId}": {`;
      const componentIndex = jsonString.indexOf(componentKey, componentsAnchor);
      if (componentIndex < 0) {
        return null;
      }

      const braceIndex = jsonString.indexOf('{', componentIndex);
      if (braceIndex < 0) {
        return null;
      }

      const objectEndIndex = findBalancedObjectEnd(jsonString, braceIndex);
      if (objectEndIndex < 0) {
        return null;
      }

      return {
        startOffset: componentIndex,
        endOffset: objectEndIndex + 1,
      };
    },
    [findBalancedObjectEnd],
  );

  const revealSelectedComponentInJson = useCallback(() => {
    if (!selectedId || activeTab !== 'json') {
      const editor = jsonEditorRef.current;
      if (editor) {
        selectionDecorationIdsRef.current = editor.deltaDecorations(
          selectionDecorationIdsRef.current,
          [],
        );
      }
      return;
    }

    const editor = jsonEditorRef.current;
    const monacoInstance = monacoRef.current;
    const model = editor?.getModel();

    if (!editor || !monacoInstance || !model) {
      return;
    }

    const rangeOffsets = findComponentJsonRange(model.getValue(), selectedId);
    if (!rangeOffsets) {
      selectionDecorationIdsRef.current = editor.deltaDecorations(
        selectionDecorationIdsRef.current,
        [],
      );
      return;
    }

    const startPosition = model.getPositionAt(rangeOffsets.startOffset);
    const endPosition = model.getPositionAt(rangeOffsets.endOffset);
    const range = new monacoInstance.Range(
      startPosition.lineNumber,
      1,
      endPosition.lineNumber,
      model.getLineMaxColumn(endPosition.lineNumber),
    );

    selectionDecorationIdsRef.current = editor.deltaDecorations(selectionDecorationIdsRef.current, [
      {
        range,
        options: {
          isWholeLine: true,
          className: 'lowcode-json-selection-block',
          linesDecorationsClassName: 'lowcode-json-selection-glyph',
        },
      },
    ]);

    window.requestAnimationFrame(() => {
      editor.revealLineInCenter(startPosition.lineNumber);
    });
  }, [activeTab, findComponentJsonRange, selectedId]);

  useEffect(() => {
    revealSelectedComponentInJson();
  }, [revealSelectedComponentInJson, schema]);

  // Editor 挂载时注册 Ctrl/Cmd + S 快捷键
  const clearSelectionDecorations = useCallback(() => {
    const editor = jsonEditorRef.current;
    if (!editor) {
      return;
    }

    selectionDecorationIdsRef.current = editor.deltaDecorations(
      selectionDecorationIdsRef.current,
      [],
    );
  }, []);

  const handleEditorMount: OnMount = useCallback(
    (editor, monacoInstance) => {
      if (!monacoInstance) return;
      jsonEditorRef.current = editor;
      monacoRef.current = monacoInstance;

      editor.onDidFocusEditorText(() => {
        clearSelectionDecorations();
      });

      // 注册 Ctrl/Cmd + S 快捷键
      editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => {
        // 直接使用 ref 调用保存逻辑，避免闭包陷阱
        if (!hasUnsavedChangesRef.current) {
          return;
        }
        try {
          const parsed = parseAndValidateSchema(editedJsonRef.current, saveWhitelistRef.current);
          if (onSchemaCommitRef.current) {
            onSchemaCommitRef.current(parsed);
          } else {
            onSchemaChangeRef.current?.(parsed);
          }
          setHasUnsavedChanges(false);
          hasUnsavedChangesRef.current = false;
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : 'JSON 格式错误';
          alert(`保存失败：${errorMessage}`);
        }
      });

      window.requestAnimationFrame(() => {
        revealSelectedComponentInJson();
      });
    },
    [clearSelectionDecorations, revealSelectedComponentInJson],
  );

  useEffect(() => {
    return () => {
      jsonEditorRef.current = null;
      monacoRef.current = null;
    };
  }, []);

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
