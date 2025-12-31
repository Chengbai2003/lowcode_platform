import { LowcodeEditor } from '@lowcode-platform/editor';

/**
 * 示例应用
 * 演示低代码编辑器的使用
 */
function App() {
  // 处理 Schema 变化
  const handleSchemaChange = (schema: any) => {
    console.log('Schema 变化:', schema);
  };

  // 处理错误
  const handleError = (error: string) => {
    console.error('Schema 错误:', error);
  };

  return (
    <div style={{ margin: 0, padding: 0 }}>
      <LowcodeEditor
        onChange={handleSchemaChange}
        onError={handleError}
        height="100vh"
        editorWidth="40%"
        theme="vs-dark"
      />
    </div>
  );
}

export default App;
