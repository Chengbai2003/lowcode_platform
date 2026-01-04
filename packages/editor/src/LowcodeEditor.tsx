import { useState, useCallback, useMemo, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { Layout, ConfigProvider, theme } from 'antd';
import type { LowcodeEditorProps } from './types';
import { Renderer } from '@lowcode-platform/renderer';
import type { ComponentSchema } from '@lowcode-platform/renderer';
import { componentRegistry } from '@lowcode-platform/components';

const { Sider, Content } = Layout;

/**
 * JSON Schema 编辑器，支持实时预览
 */
export function LowcodeEditor({
  initialSchema,
  editorWidth = '50%',
  theme: editorTheme = 'vs-dark',
  height = '100vh',
  components: customComponents = {},
  onChange,
  onError,
  showLineNumbers = true,
  wordWrap = true,
  eventContext = {},
}: LowcodeEditorProps) {
  // 将 initialSchema 转换为 JSON 字符串
  const initialJson = useMemo(() => {
    if (typeof initialSchema === 'string') {
      return initialSchema;
    }
    return initialSchema
      ? JSON.stringify(initialSchema, null, 2)
      : JSON.stringify(
          {
            componentName: 'Page',
            props: {},
            children: [],
          },
          null,
          2
        );
  }, [initialSchema]);

  const [json, setJson] = useState(initialJson);
  const [schema, setSchema] = useState<ComponentSchema | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 解析 JSON 并更新 schema
  useEffect(() => {
    try {
      const parsed = JSON.parse(json) as ComponentSchema;
      setSchema(parsed);
      setError(null);
      onChange?.(parsed);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : '无效的 JSON';
      setError(errorMessage);
      onError?.(errorMessage);
    }
  }, [json, onChange, onError]);

  // 处理编辑器内容变化
  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      setJson(value);
    }
  }, []);

  // 合并自定义组件与默认注册表
  const allComponents = useMemo(() => {
    return { ...componentRegistry, ...customComponents };
  }, [customComponents]);

  // 计算编辑器宽度
  const siderStyle = useMemo(() => {
    if (typeof editorWidth === 'number') {
      return { width: `${editorWidth}px` };
    }
    return { width: editorWidth };
  }, [editorWidth]);

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
      }}
    >
      <Layout style={{ height: typeof height === 'number' ? `${height}px` : height }}>
        {/* 左侧面板：JSON 编辑器 */}
        <Sider
          width={siderStyle.width}
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
                background: '#2d2d2d',
                color: '#cccccc',
                fontSize: '14px',
                fontWeight: 500,
                borderBottom: '1px solid #303030',
                flexShrink: 0,
              }}
            >
              JSON Schema Editor
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <Editor
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
            </div>
          </div>
        </Sider>

        {/* 右侧面板：实时预览 */}
        <Content
          style={{
            background: '#ffffff',
            overflow: 'auto',
            position: 'relative',
          }}
        >
          {error && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                padding: '12px 16px',
                background: '#fff2f0',
                borderBottom: '1px solid #ffccc7',
                color: '#ff4d4f',
                zIndex: 10,
              }}
            >
              <strong>JSON 错误：</strong> {error}
            </div>
          )}
          <div
            style={{
              padding: error ? '48px 0 0 0' : '0',
              minHeight: '100%',
              background: '#f0f2f5',
            }}
          >
            {schema ? (
              <Renderer schema={schema} components={allComponents} eventContext={eventContext} />
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: '#999',
                  fontSize: '16px',
                }}
              >
                加载预览中...
              </div>
            )}
          </div>
        </Content>
      </Layout>
    </ConfigProvider>
  );
}

export default LowcodeEditor;
