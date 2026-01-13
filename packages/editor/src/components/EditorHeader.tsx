import React from 'react';
import { Layout, Segmented, Button, Tooltip } from 'antd';
import { SunOutlined, MoonOutlined, PlayCircleOutlined } from '@ant-design/icons';

interface EditorHeaderProps {
  previewTheme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => void;
  onCompile: () => void;
}

export const EditorHeader: React.FC<EditorHeaderProps> = ({ previewTheme, onThemeChange, onCompile }) => {
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
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ marginRight: '8px' }}>⚡</span>
        低代码平台
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <Tooltip title="编译并生成代码">
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={onCompile}
            size="small"
          >
            编译运行
          </Button>
        </Tooltip>

        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: '14px', marginRight: '8px', color: '#ccc' }}>预览主题:</span>
          <Segmented
            value={previewTheme}
            onChange={(value) => onThemeChange(value as 'light' | 'dark')}
            options={[
              {
                label: '浅色',
                value: 'light',
                icon: <SunOutlined />,
              },
              {
                label: '深色',
                value: 'dark',
                icon: <MoonOutlined />,
              },
            ]}
            style={{ background: '#303030', color: '#fff' }}
          />
        </div>
      </div>
    </Layout.Header>
  );
};
