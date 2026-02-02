import { useState, useCallback, useMemo, useEffect } from 'react';
import { ConfigProvider, theme, message } from 'antd';
import type { LowcodeEditorProps } from './types';
import type { A2UISchema } from '@lowcode-platform/renderer';
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
          rootId: 'root',
          components: {
            root: {
              id: 'root',
              type: 'Page',
              props: {},
              childrenIds: []
            }
          }
        },
        null,
        2
      );
  }, [initialSchema]);

  const [json, setJson] = useState(initialJson);
  const [schema, setSchema] = useState<A2UISchema | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'json' | 'visual' | 'code' | 'ai'>('json');
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>('light');
  const [compiledCode, setCompiledCode] = useState<string>('');

  // 解析 JSON 并更新 schema
  useEffect(() => {
    try {
      const parsed = JSON.parse(json) as A2UISchema;

      // 简单校验 A2UI 结构
      if (!parsed.rootId || !parsed.components) {
        throw new Error('Invalid A2UI Schema: Missing rootId or components');
      }

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

  // 处理AI生成的Schema更新
  const handleAISchemaUpdate = useCallback((newSchema: A2UISchema) => {
    setSchema(newSchema);
    setJson(JSON.stringify(newSchema, null, 2));
    onChange?.(newSchema);
    // 切换到JSON编辑器查看结果
    setActiveTab('json');
    message.success('AI助手已更新Schema！');
  }, [onChange]);

  // 合并自定义组件与默认注册表
  const allComponents = useMemo(() => {
    return { ...componentRegistry, ...customComponents };
  }, [customComponents]);

  // 简化的布局逻辑：使用 flexbox
  return (
    <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm }}>
      <div style={{ height, display: 'flex', flexDirection: 'column' }}>
        <EditorHeader
          onCompile={handleCompile}
          previewTheme={previewTheme}
          onThemeChange={(t) => setPreviewTheme(t)}
        />
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <ActivityBar activeTab={activeTab} setActiveTab={setActiveTab} />
          <EditorPane
            activeTab={activeTab}
            width={editorWidth}
            json={json}
            compiledCode={compiledCode}
            editorTheme={editorTheme}
            showLineNumbers={showLineNumbers}
            wordWrap={wordWrap}
            handleEditorChange={handleEditorChange}
            schema={schema}
            onSchemaUpdate={handleAISchemaUpdate}
            onError={onError}
          />
          <PreviewPane
            error={error}
            schema={schema}
            allComponents={allComponents}
            eventContext={eventContext}
            previewTheme={previewTheme}
          />
        </div>
      </div>
    </ConfigProvider>
  );
}
