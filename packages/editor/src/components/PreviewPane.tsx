import React from 'react';
import { Layout, ConfigProvider, theme } from 'antd';
import { Renderer } from '@lowcode-platform/renderer';
import type { ComponentRegistry, A2UISchema } from '@lowcode-platform/renderer';

const { Content } = Layout;

interface PreviewPaneProps {
  schema: A2UISchema | null;
  allComponents: ComponentRegistry;
  eventContext: Record<string, any>;
  previewTheme: 'light' | 'dark';
  error: string | null;
}

export const PreviewPane: React.FC<PreviewPaneProps> = ({
  schema,
  allComponents,
  eventContext,
  previewTheme,
  error
}) => {
  return (
    <Content
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '24px',
        background: previewTheme === 'dark' ? '#1e1e1e' : '#f0f2f5',
        position: 'relative'
      }}
    >
      <div
        style={{
          width: '100%',
          minHeight: '100%',
          background: previewTheme === 'dark' ? '#141414' : '#fff',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          padding: '24px'
        }}
      >
        <ConfigProvider
          theme={{
            algorithm: previewTheme === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm
          }}
        >
          {error ? (
            <div style={{ color: 'red', padding: '20px' }}>
              <h3>渲染错误</h3>
              <pre>{error}</pre>
            </div>
          ) : (
            schema ? (
              <Renderer
                schema={schema}
                components={allComponents}
                eventContext={eventContext}
              />
            ) : (
              <div style={{ padding: 20, textAlign: 'center', color: '#888' }}>
                暂无内容，请在左侧编辑器输入 Schema
              </div>
            )
          )}
        </ConfigProvider>
      </div>
    </Content>
  );
};
