import React, { useState, useCallback, useEffect, useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { ComponentPreset } from '@lowcode-platform/renderer';
import type { ComponentRegistry, PageSchema } from '../../../../types';
import type { SharedSchemaIssue } from '../../../../schema/schemaValidation';
import { serializePageSchema } from '../../../services/schemaSync';
import {
  serializePageLogic,
  parseAndValidatePageLogic,
  parseAndValidateFullSchema,
} from '../../../services/pageLogicAuthoring';
import { SelectableCanvas } from './SelectableCanvas';
import { NoSchemaEmptyState } from '../../EmptyState';
import styles from './PreviewPane.module.scss';

interface PreviewPaneProps {
  schema: PageSchema | null;
  preset: ComponentPreset;
  pageId: string;
  documentSessionId: string;
  allComponents?: ComponentRegistry;
  eventContext: Record<string, unknown>;
  previewTheme: 'light' | 'dark';
  selectedId?: string | null;
  isPreviewMode?: boolean;
  compiledCode?: string | null;
  onSchemaChange?: (schema: PageSchema) => void;
  onSchemaCommit?: (schema: PageSchema) => void;
}

type ActiveTab = 'preview' | 'logic' | 'json' | 'compiled';

export const PreviewPane: React.FC<PreviewPaneProps> = ({
  schema,
  preset,
  pageId,
  documentSessionId,
  allComponents = {},
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
  const [jsonValidationErrors, setJsonValidationErrors] = useState<SharedSchemaIssue[]>([]);
  const editedJsonRef = useRef<string>('');
  const hasUnsavedChangesRef = useRef(false);

  const [editedLogicJson, setEditedLogicJson] = useState<string>('');
  const [hasUnsavedLogicChanges, setHasUnsavedLogicChanges] = useState(false);
  const [logicValidationErrors, setLogicValidationErrors] = useState<SharedSchemaIssue[]>([]);
  const editedLogicJsonRef = useRef<string>('');
  const hasUnsavedLogicChangesRef = useRef(false);

  const schemaRef = useRef<PageSchema | null>(schema);
  const saveWhitelistRef = useRef<string[]>(Object.keys(allComponents));
  const onSchemaCommitRef = useRef(onSchemaCommit);
  const onSchemaChangeRef = useRef(onSchemaChange);
  const jsonEditorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const logicEditorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const selectionDecorationIdsRef = useRef<string[]>([]);

  useEffect(() => {
    schemaRef.current = schema;
  }, [schema]);

  useEffect(() => {
    editedJsonRef.current = editedJson;
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [editedJson, hasUnsavedChanges]);

  useEffect(() => {
    editedLogicJsonRef.current = editedLogicJson;
    hasUnsavedLogicChangesRef.current = hasUnsavedLogicChanges;
  }, [editedLogicJson, hasUnsavedLogicChanges]);

  useEffect(() => {
    saveWhitelistRef.current = Object.keys(allComponents);
  }, [allComponents]);

  useEffect(() => {
    onSchemaCommitRef.current = onSchemaCommit;
    onSchemaChangeRef.current = onSchemaChange;
  }, [onSchemaChange, onSchemaCommit]);

  // 将 schema 转换为可展示的 JSON 格式
  const getDisplayJson = useCallback(() => {
    return serializePageSchema(schema);
  }, [schema]);

  // 将 schema.logic 转换为可展示的 JSON 格式
  const getDisplayLogicJson = useCallback(() => {
    return serializePageLogic(schema?.logic);
  }, [schema?.logic]);

  // 当 schema 变化或切换到 JSON tab 时，重置编辑内容
  useEffect(() => {
    if (activeTab === 'json') {
      const json = getDisplayJson();
      setEditedJson(json);
      setHasUnsavedChanges(false);
      setJsonValidationErrors([]);
    }
  }, [activeTab, getDisplayJson]);

  // 当 schema.logic 变化或切换到 Logic tab 时，重置编辑内容
  useEffect(() => {
    if (activeTab === 'logic') {
      const logicJson = getDisplayLogicJson();
      setEditedLogicJson(logicJson);
      setHasUnsavedLogicChanges(false);
      setLogicValidationErrors([]);
    }
  }, [activeTab, getDisplayLogicJson]);

  // 处理 Logic 编辑
  const handleLogicJsonChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      setEditedLogicJson(value);
      setHasUnsavedLogicChanges(true);
      editedLogicJsonRef.current = value;
      hasUnsavedLogicChangesRef.current = true;
    }
  }, []);

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
        const result = parseAndValidateFullSchema(editedJsonRef.current, saveWhitelistRef.current);
        if (result.success) {
          setJsonValidationErrors([]);
          if (onSchemaCommitRef.current) {
            onSchemaCommitRef.current(result.data);
          } else {
            onSchemaChangeRef.current?.(result.data);
          }
          setHasUnsavedChanges(false);
          hasUnsavedChangesRef.current = false;
        } else {
          setJsonValidationErrors(result.issues);
        }
      });

      window.requestAnimationFrame(() => {
        revealSelectedComponentInJson();
      });
    },
    [clearSelectionDecorations, revealSelectedComponentInJson],
  );

  const handleLogicEditorMount: OnMount = useCallback((editor, monacoInstance) => {
    if (!monacoInstance) return;
    logicEditorRef.current = editor;

    // 注册 Ctrl/Cmd + S 快捷键
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => {
      if (!hasUnsavedLogicChangesRef.current) {
        return;
      }
      if (!schemaRef.current) {
        return;
      }
      const result = parseAndValidatePageLogic(
        editedLogicJsonRef.current,
        schemaRef.current,
        saveWhitelistRef.current,
      );
      if (result.success) {
        setLogicValidationErrors([]);
        if (onSchemaCommitRef.current) {
          onSchemaCommitRef.current(result.data);
        } else {
          onSchemaChangeRef.current?.(result.data);
        }
        setHasUnsavedLogicChanges(false);
        hasUnsavedLogicChangesRef.current = false;
      } else {
        setLogicValidationErrors(result.issues);
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      jsonEditorRef.current = null;
      logicEditorRef.current = null;
      monacoRef.current = null;
    };
  }, []);

  const renderErrorPanel = (issues: SharedSchemaIssue[], onClose: () => void) => {
    if (issues.length === 0) return null;
    return (
      <div className={styles.errorPanel} role="alert" data-testid="schema-error-panel">
        <div className={styles.errorPanelHeader}>
          <span>校验错误 ({issues.length})</span>
          <button
            className={styles.errorPanelClose}
            onClick={onClose}
            aria-label="关闭错误面板"
            type="button"
          >
            ×
          </button>
        </div>
        <div className={styles.errorList}>
          {issues.map((issue, idx) => (
            <div
              key={`${issue.code}-${idx}`}
              className={styles.errorItem}
              data-testid="schema-error-item"
            >
              <span className={styles.issueCode}>{issue.code}</span>
              <span className={styles.issueDivider}>·</span>
              <span className={styles.issuePath}>
                {issue.path.length > 0 ? issue.path.join('.') : '(root)'}
              </span>
              <span className={styles.issueDivider}>·</span>
              <span className={styles.issueMessage}>{issue.message}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

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
            className={`${styles.tabButton} ${activeTab === 'logic' ? styles.active : ''}`}
            onClick={() => setActiveTab('logic')}
          >
            页面逻辑
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
            preset={preset}
            pageId={pageId}
            documentSessionId={documentSessionId}
            eventContext={eventContext}
            isPreviewMode={isPreviewMode}
          />
        )}

        {activeTab === 'logic' && schema && (
          <div className={styles.editorContainer}>
            <div className={styles.jsonEditorHeader}>
              <span className={styles.saveHint}>
                {hasUnsavedLogicChanges ? (
                  <span className={styles.unsaved}>
                    <span className={styles.dot} /> 按 Ctrl+S 保存修改
                  </span>
                ) : (
                  <span className={styles.saved}>已同步</span>
                )}
              </span>
            </div>
            <div className={styles.monacoContainer}>
              <Editor
                height="100%"
                defaultLanguage="json"
                theme={previewTheme === 'dark' ? 'vs-dark' : 'light'}
                value={editedLogicJson}
                onChange={handleLogicJsonChange}
                onMount={handleLogicEditorMount}
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
            {renderErrorPanel(logicValidationErrors, () => setLogicValidationErrors([]))}
          </div>
        )}

        {activeTab === 'logic' && !schema && <NoSchemaEmptyState />}

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
            <div className={styles.monacoContainer}>
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
            {renderErrorPanel(jsonValidationErrors, () => setJsonValidationErrors([]))}
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
