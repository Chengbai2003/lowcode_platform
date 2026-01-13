import { useState, useCallback, useMemo, useEffect } from 'react';
import { Layout, ConfigProvider, theme, message } from 'antd';
import type { LowcodeEditorProps } from './types';
import type { ComponentSchema } from '@lowcode-platform/renderer';
import { componentRegistry } from '@lowcode-platform/components';
import { compileToCode } from '@lowcode-platform/compiler';
import {
  EditorHeader,
  ActivityBar,
  EditorPane,
  PreviewPane,
} from './components';

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
  const [activeTab, setActiveTab] = useState<'json' | 'visual' | 'code'>('json');
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>('light');
  const [compiledCode, setCompiledCode] = useState<string>('');

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

  // 编译处理函数
  const handleCompile = useCallback(() => {
    if (schema) {
      try {
        const code = compileToCode(schema);
        setCompiledCode(code);
        setActiveTab('code');
        message.success('编译成功！');
      } catch (e: any) {
        console.error(e);
        message.error('编译失败: ' + e.message);
      }
    } else {
      message.warning('Schema 为空，无法编译');
    }
  }, [schema]);

  // 合并自定义组件与默认注册表
  const allComponents = useMemo(() => {
    return { ...componentRegistry, ...customComponents };
  }, [customComponents]);

  // 计算编辑器宽度 - 将其作为数字处理以便计算
  const numericEditorWidth = useMemo(() => {
    if (typeof editorWidth === 'string' && editorWidth.endsWith('%')) {
      return editorWidth;
    }
    if (typeof editorWidth === 'string' && editorWidth.endsWith('px')) {
      return parseInt(editorWidth, 10);
    }
    return editorWidth;
  }, [editorWidth]);

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
      }}
    >
      <Layout style={{ height: typeof height === 'number' ? `${height}px` : height, overflow: 'hidden' }}>
        {/* 1. Top Header */}
        <EditorHeader
          previewTheme={previewTheme}
          onThemeChange={setPreviewTheme}
          onCompile={handleCompile}
        />

        <Layout style={{ height: '100%' }}>
          {/* 2. Left Activity Bar */}
          <ActivityBar activeTab={activeTab} setActiveTab={setActiveTab} />

          {/* 3. Middle Editor Pane */}
          <EditorPane
            activeTab={activeTab}
            width={numericEditorWidth}
            json={json}
            compiledCode={compiledCode}
            editorTheme={editorTheme}
            showLineNumbers={showLineNumbers}
            wordWrap={wordWrap}
            handleEditorChange={handleEditorChange}
          />

          {/* 4. Right Preview Pane */}
          <PreviewPane
            error={error}
            schema={schema}
            allComponents={allComponents}
            eventContext={eventContext}
            previewTheme={previewTheme}
          />
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}
export default LowcodeEditor;
