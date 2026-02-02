import React from 'react';
import { Layout } from 'antd';

const { Sider } = Layout;

interface ActivityBarProps {
  activeTab: 'json' | 'visual' | 'code' | 'ai';
  setActiveTab: (tab: 'json' | 'visual' | 'code' | 'ai') => void;
}

export const ActivityBar: React.FC<ActivityBarProps> = ({ activeTab, setActiveTab }) => {
  return (
    <Sider
      width={48}
      style={{
        background: '#252526',
        borderRight: '1px solid #303030',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: '12px',
      }}
    >
      <div
        style={{
          width: '48px',
          height: '48px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          cursor: 'pointer',
          color: activeTab === 'json' ? '#fff' : '#858585',
          borderLeft: activeTab === 'json' ? '2px solid #007fd4' : '2px solid transparent',
          background: activeTab === 'json' ? '#37373d' : 'transparent',
        }}
        onClick={() => setActiveTab('json')}
        title="Schema 编辑"
      >
        {/* JSON Icon */}
        <svg viewBox="0 0 1024 1024" width="24" height="24" fill="currentColor">
          <path d="M832 64H192c-17.7 0-32 14.3-32 32v832c0 17.7 14.3 32 32 32h640c17.7 0 32-14.3 32-32V96c0-17.7-14.3-32-32-32zm-40 824H232V136h560v752zM360 384h304v56H360zm0 136h304v56H360zm0 136h208v56H360z" />
        </svg>
      </div>

      <div
        style={{
          width: '48px',
          height: '48px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          cursor: 'pointer',
          color: activeTab === 'visual' ? '#fff' : '#858585',
          borderLeft: activeTab === 'visual' ? '2px solid #007fd4' : '2px solid transparent',
          background: activeTab === 'visual' ? '#37373d' : 'transparent',
        }}
        onClick={() => setActiveTab('visual')}
        title="可视化编辑"
      >
        {/* Visual Icon (Dashboard/Layout) */}
        <svg viewBox="0 0 1024 1024" width="24" height="24" fill="currentColor">
          <path d="M880 112H144c-17.7 0-32 14.3-32 32v736c0 17.7 14.3 32 32 32h736c17.7 0 32-14.3 32-32V144c0-17.7-14.3-32-32-32zm-40 728H184V184h656v656zM320 280h112v112H320V280zm0 288h112v112H320V568zM592 280h112v112H592V280zm0 288h112v112H592V568z" />
        </svg>
      </div>

      <div
        style={{
          width: '48px',
          height: '48px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          cursor: 'pointer',
          color: activeTab === 'code' ? '#fff' : '#858585',
          borderLeft: activeTab === 'code' ? '2px solid #007fd4' : '2px solid transparent',
          background: activeTab === 'code' ? '#37373d' : 'transparent',
        }}
        onClick={() => setActiveTab('code')}
        title="查看生成代码"
      >
        {/* Code Icon (React/Tag) */}
        <svg viewBox="0 0 1024 1024" width="24" height="24" fill="currentColor">
          <path d="M516 673c0 4.4-3.6 8-8 8h-48c-4.4 0-8-3.6-8-8V351c0-4.4 3.6-8 8-8h48c4.4 0 8 3.6 8 8v322zM324 742c-2.8 0-5.4-1.1-7.4-3.1l-142-142c-4.1-4.1-4.1-10.7 0-14.8l142-142c1.9-1.9 4.6-3.1 7.4-3.1h48c4.4 0 8 3.6 8 8v34.4c0 2.2-0.9 4.2-2.3 5.7L258.1 600l119.6 112.9c1.4 1.5 2.3 3.5 2.3 5.7V734c0 4.4-3.6 8-8 8h-48zM700 742H652c-4.4 0-8-3.6-8-8v-34.4c0-2.2 0.9-4.2 2.3-5.7l119.6-113.3-119.6-112.9c-1.4-1.5-2.3-3.5-2.3-5.7V359c0-4.4 3.6-8 8-8h48c2.8 0 5.4 1.1 7.4 3.1l142 142c4.1 4.1 4.1 10.7 0 14.8l-142 142c-2.2 2-4.8 3.1-7.4 3.1z" />
        </svg>
      </div>

      <div
        style={{
          width: '48px',
          height: '48px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          cursor: 'pointer',
          color: activeTab === 'ai' ? '#fff' : '#858585',
          borderLeft: activeTab === 'ai' ? '2px solid #007fd4' : '2px solid transparent',
          background: activeTab === 'ai' ? '#37373d' : 'transparent',
        }}
        onClick={() => setActiveTab('ai')}
        title="AI 助手"
      >
        {/* AI Icon */}
        <svg viewBox="0 0 1024 1024" width="24" height="24" fill="currentColor">
          <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 820c-205.4 0-372-166.6-372-372s166.6-372 372-372 372 166.6 372 372-166.6 372-372 372z"/>
          <path d="M464 336c0-26.5 21.5-48 48-48s48 21.5 48 48-21.5 48-48 48-48-21.5-48-48zm-24 192h48v160h-48zm96 0h48v160h-48zm-192 0h48v160h-48zm288 0h48v160h-48z"/>
        </svg>
      </div>
    </Sider>
  );
};