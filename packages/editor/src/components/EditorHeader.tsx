import React from 'react';
import { Layout } from 'antd';

export const EditorHeader: React.FC = () => {
  return (
    <Layout.Header
      style={{
        display: 'flex',
        alignItems: 'center',
        height: '48px',
        padding: '0 16px',
        background: '#1f1f1f',
        borderBottom: '1px solid #303030',
        color: '#fff',
        fontSize: '16px',
        fontWeight: 600,
      }}
    >
      <span style={{ marginRight: '8px' }}>⚡</span>
      低代码平台
    </Layout.Header>
  );
};
