import React from 'react';
import { Layout } from 'antd';
import Editor from '@monaco-editor/react';
import { AIAssistant } from './AI';
import type { A2UISchema } from '@lowcode-platform/renderer';

const { Sider } = Layout;

interface EditorPaneProps {
  activeTab: 'json' | 'visual' | 'code' | 'ai';
  width: number | string;
  json: string;
  compiledCode?: string;
  editorTheme: string;
  showLineNumbers: boolean;
  wordWrap: boolean;
  handleEditorChange: (value: string | undefined) => void;
  schema?: A2UISchema | null;
  onSchemaUpdate?: (schema: A2UISchema) => void;
  onError?: (error: string) => void;
}

export const EditorPane: React.FC<EditorPaneProps> = ({
  activeTab,
  width,
  json,
  compiledCode,
  editorTheme,
  showLineNumbers,
  wordWrap,
  handleEditorChange,
  schema,
  onSchemaUpdate,
  onError,
}) => {
  return (
    <Sider
      width={width}
      style={{
        background: '#1e1e1e',
        borderRight: '1px solid #303030',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        }}
      >
        <div
          style={{
            padding: '8px 16px',
            background: '#252526',
            color: '#cccccc',
            fontSize: '11px',
            textTransform: 'uppercase',
            fontWeight: 500,
            borderBottom: '1px solid #303030',
            flexShrink: 0,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>
            {activeTab === 'json'
              ? 'JSON SCHEMA'
              : activeTab === 'code'
                ? 'REACT CODE'
                : activeTab === 'ai'
                  ? 'AI ASSISTANT'
                  : 'VISUAL EDITOR'}
          </span>
        </div>

        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {activeTab === 'json' ? (
            <Editor
              key="json"
              height="100%"
              defaultLanguage="json"
              theme={editorTheme}
              value={json}
              onChange={handleEditorChange}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: showLineNumbers ? 'on' : 'off',
                wordWrap: wordWrap ? 'on' : 'off',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                formatOnPaste: true,
                formatOnType: true,
              }}
            />
          ) : activeTab === 'code' ? (
            <Editor
              key="code"
              height="100%"
              defaultLanguage="typescript"
              theme={editorTheme}
              value={compiledCode || '// 点击上方“编译运行”按钮生成代码'}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: showLineNumbers ? 'on' : 'off',
                wordWrap: wordWrap ? 'on' : 'off',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
              }}
            />
          ) : activeTab === 'visual' ? (
            <div
              style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#858585',
                padding: '20px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>🚧</div>
              <div style={{ fontSize: '16px', fontWeight: 500, marginBottom: '8px' }}>
                可视化编辑器开发中
              </div>
              <div style={{ fontSize: '13px' }}>即将支持拖拽布局与属性配置</div>
            </div>
          ) : activeTab === 'ai' ? (
            <AIAssistant
              currentSchema={schema || null}
              onSchemaUpdate={onSchemaUpdate || (() => {})}
              onError={onError}
            />
          ) : null}
        </div>
      </div>
    </Sider>
  );
};
