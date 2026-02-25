import { useState, useCallback, useMemo, useEffect } from 'react';
import { ConfigProvider, theme, message, Modal } from 'antd';
import type { LowcodeEditorProps } from './types';
import type { A2UISchema } from '@lowcode-platform/renderer';
import { safeValidateSchema } from '@lowcode-platform/renderer';
import { componentRegistry } from '@lowcode-platform/components';
import { compileToCode } from '@lowcode-platform/compiler';
import {
  EditorHeader,
  ActivityBar,
  EditorPane,
  PreviewPane,
} from './components';
import { useDraftStorage } from './hooks/useDraftStorage';

// 导入样式
import './components/AI/AIAssistant.css';
import './components/AI/AIConfig.css';
import './components/AIAssistant.css';

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
  
  const { saveDraft, loadDraft, clearDraft } = useDraftStorage('default');

  // 挂载时检查草稿
  useEffect(() => {
    const draft = loadDraft();
    if (draft && draft.json !== initialJson) {
      const savedTime = new Date(draft.savedAt).toLocaleTimeString();
      Modal.confirm({
        title: '发现未保存的草稿',
        content: `上次编辑于 ${savedTime}，是否恢复？`,
        onOk: () => setJson(draft.json),
        onCancel: () => clearDraft(),
      });
    }
  }, [loadDraft, clearDraft, initialJson]);

  // 解析 JSON 并更新 schema
  useEffect(() => {
    try {
      const raw = JSON.parse(json);
      const result = safeValidateSchema(raw);

      if (!result.success) {
        throw new Error(`Schema 校验失败: ${result.error.issues[0]?.message || '非法 Schema'}`);
      }

      setSchema(result.data);
      setError(null);
      onChange?.(result.data);
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
      saveDraft(value);
    }
  }, [saveDraft]);

  // 编译处理函数
  const handleCompile = useCallback(() => {
    if (schema) {
      try {
        const code = compileToCode(schema);
        setCompiledCode(code);
        setActiveTab('code');
        message.success('编译成功！');
        clearDraft(); // 如果编译成功，可以认为状态稳定，清理草稿（可选策略，这里加上了）
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
    // 不切换到JSON编辑器，保持当前（AI）视图，用户可以在右侧预览
    // message.success('AI助手已更新Schema！'); // 移除重复提示，AIAssistant 已有提示
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
