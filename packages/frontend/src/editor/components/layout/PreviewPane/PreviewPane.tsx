import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import type { ComponentRegistry, A2UISchema } from '../../../../types';
import { SelectableCanvas } from './SelectableCanvas';
import { NoSchemaEmptyState } from '../../EmptyState';
import styles from './PreviewPane.module.scss';

interface PreviewPaneProps {
  schema: A2UISchema | null;
  allComponents: ComponentRegistry;
  eventContext: Record<string, unknown>;
  previewTheme: 'light' | 'dark';
  isPreviewMode?: boolean;
  compiledCode?: string | null;
}

type ActiveTab = 'preview' | 'json' | 'compiled';

export const PreviewPane: React.FC<PreviewPaneProps> = ({
  schema,
  allComponents,
  eventContext,
  previewTheme,
  isPreviewMode,
  compiledCode,
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('preview');

  // 将 schema 转换为可展示的 JSON 格式
  const getDisplayJson = () => {
    if (!schema) return '{}';
    const { rootId, components } = schema;
    return JSON.stringify({ rootId, components }, null, 2);
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
            <Editor
              height="100%"
              defaultLanguage="json"
              theme={previewTheme === 'dark' ? 'vs-dark' : 'light'}
              value={getDisplayJson()}
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
