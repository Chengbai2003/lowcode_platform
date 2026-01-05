import React from 'react';
import { Layout } from 'antd';
import { Renderer } from '@lowcode-platform/renderer';
import type { ComponentSchema } from '@lowcode-platform/renderer';

const { Content } = Layout;

interface PreviewPaneProps {
  error: string | null;
  schema: ComponentSchema | null;
  allComponents: any;
  eventContext: any;
}

export const PreviewPane: React.FC<PreviewPaneProps> = ({
  error,
  schema,
  allComponents,
  eventContext,
}) => {
  return (
    <Content
      style={{
        background: '#ffffff',
        height: '100%',
        overflow: 'hidden', // Disable scrolling on Content directly, let inner div handle it
        display: 'flex',
        flexDirection: 'column',
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
          flex: 1, // Fill available space
          overflow: 'auto', // Scroll here
          background: '#f0f2f5',
          position: 'relative',
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
  );
};
