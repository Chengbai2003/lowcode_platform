import React from 'react';
import { Layout } from 'antd';
import styles from './ActivityBar.module.scss';

const { Sider } = Layout;

interface ActivityBarProps {
  activeTab: 'json' | 'visual' | 'code';
  setActiveTab: (tab: 'json' | 'visual' | 'code') => void;
}

export const ActivityBar: React.FC<ActivityBarProps> = ({ activeTab, setActiveTab }) => {
  return (
    <Sider width={48} className={styles.activityBar}>
      <div
        className={`${styles.tabItem} ${activeTab === 'json' ? styles.active : ''}`}
        onClick={() => setActiveTab('json')}
        title="Schema 编辑"
      >
        {/* JSON Icon */}
        <svg
          className={styles.icon}
          viewBox="0 0 1024 1024"
          width="24"
          height="24"
          fill="currentColor"
        >
          <path d="M832 64H192c-17.7 0-32 14.3-32 32v832c0 17.7 14.3 32 32 32h640c17.7 0 32-14.3 32-32V96c0-17.7-14.3-32-32-32zm-40 824H232V136h560v752zM360 384h304v56H360zm0 136h304v56H360zm0 136h208v56H360z" />
        </svg>
      </div>

      <div
        className={`${styles.tabItem} ${activeTab === 'visual' ? styles.active : ''}`}
        onClick={() => setActiveTab('visual')}
        title="可视化编辑"
      >
        {/* Visual Icon (Dashboard/Layout) */}
        <svg
          className={styles.icon}
          viewBox="0 0 1024 1024"
          width="24"
          height="24"
          fill="currentColor"
        >
          <path d="M880 112H144c-17.7 0-32 14.3-32 32v736c0 17.7 14.3 32 32 32h736c17.7 0 32-14.3 32-32V144c0-17.7-14.3-32-32-32zm-40 728H184V184h656v656zM320 280h112v112H320V280zm0 288h112v112H320V568zM592 280h112v112H592V280zm0 288h112v112H592V568z" />
        </svg>
      </div>

      <div
        className={`${styles.tabItem} ${activeTab === 'code' ? styles.active : ''}`}
        onClick={() => setActiveTab('code')}
        title="查看生成代码"
      >
        {/* Code Icon (React/Tag) */}
        <svg
          className={styles.icon}
          viewBox="0 0 1024 1024"
          width="24"
          height="24"
          fill="currentColor"
        >
          <path d="M516 673c0 4.4-3.6 8-8 8h-48c-4.4 0-8-3.6-8-8V351c0-4.4 3.6-8 8-8h48c4.4 0 8 3.6 8 8v322zM324 742c-2.8 0-5.4-1.1-7.4-3.1l-142-142c-4.1-4.1-4.1-10.7 0-14.8l142-142c1.9-1.9 4.6-3.1 7.4-3.1h48c4.4 0 8 3.6 8 8v34.4c0 2.2-0.9 4.2-2.3 5.7L258.1 600l119.6 112.9c1.4 1.5 2.3 3.5 2.3 5.7V734c0 4.4-3.6 8-8 8h-48zM700 742H652c-4.4 0-8-3.6-8-8v-34.4c0-2.2 0.9-4.2 2.3-5.7l119.6-113.3-119.6-112.9c-1.4-1.5-2.3-3.5-2.3-5.7V359c0-4.4 3.6-8 8-8h48c2.8 0 5.4 1.1 7.4 3.1l142 142c4.1 4.1 4.1 10.7 0 14.8l-142 142c-2.2 2-4.8 3.1-7.4 3.1z" />
        </svg>
      </div>

      {/* AI 助手已移至浮动岛，使用 Cmd+K 触发 */}
    </Sider>
  );
};
