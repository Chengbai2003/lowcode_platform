import React from 'react';
import {
  X,
  Database,
  Variable,
  MessageSquare,
  ArrowRight,
  Code,
  LayoutTemplate,
  Clock,
  FileText,
  Equal,
  RotateCcw,
} from 'lucide-react';
import styles from './PropertyPanel.module.scss';

interface ActionSelectorModalProps {
  onClose: () => void;
  onSelect: (actionType: string) => void;
}

const ACTION_TYPES: {
  type: string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  color: string;
  bg: string;
  title: string;
  desc: string;
}[] = [
  {
    type: 'setValue',
    icon: Variable,
    color: 'text-blue-600',
    bg: 'bg-blue-100',
    title: '设置变量',
    desc: '设置字段/状态值',
  },
  {
    type: 'apiCall',
    icon: Database,
    color: 'text-purple-600',
    bg: 'bg-purple-100',
    title: 'API 请求',
    desc: '发送 HTTP 请求',
  },
  {
    type: 'navigate',
    icon: ArrowRight,
    color: 'text-emerald-600',
    bg: 'bg-emerald-100',
    title: '页面跳转',
    desc: '路由导航',
  },
  {
    type: 'feedback',
    icon: MessageSquare,
    color: 'text-amber-600',
    bg: 'bg-amber-100',
    title: '消息提示',
    desc: 'Toast 或弹窗提示',
  },
  {
    type: 'dialog',
    icon: LayoutTemplate,
    color: 'text-pink-600',
    bg: 'bg-pink-100',
    title: '控制弹窗',
    desc: '打开或关闭页面弹窗',
  },
  {
    type: 'if',
    icon: Equal,
    color: 'text-cyan-600',
    bg: 'bg-cyan-100',
    title: '条件判断',
    desc: 'If/Else 逻辑分支',
  },
  {
    type: 'loop',
    icon: RotateCcw,
    color: 'text-indigo-600',
    bg: 'bg-indigo-100',
    title: '循环',
    desc: '遍历数组执行动作',
  },
  {
    type: 'delay',
    icon: Clock,
    color: 'text-orange-600',
    bg: 'bg-orange-100',
    title: '延迟',
    desc: '延时执行后续动作',
  },
  {
    type: 'log',
    icon: FileText,
    color: 'text-slate-600',
    bg: 'bg-slate-100',
    title: '日志',
    desc: '输出调试日志',
  },
  {
    type: 'customScript',
    icon: Code,
    color: 'text-red-600',
    bg: 'bg-red-100',
    title: '自定义脚本',
    desc: '执行 JavaScript',
  },
];

export const ActionSelectorModal: React.FC<ActionSelectorModalProps> = ({ onClose, onSelect }) => {
  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.actionSelectorModal} onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className={styles.modalHeader}>
          <div>
            <h3 className={styles.modalTitle}>选择动作类型</h3>
            <p className={styles.modalDesc}>选择要添加到事件流中的动作节点</p>
          </div>
          <button className={styles.modalClose} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Action Grid */}
        <div className={styles.actionGrid}>
          {ACTION_TYPES.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.type}
                className={styles.actionOption}
                onClick={() => onSelect(action.type)}
              >
                <div className={`${styles.actionOptionIcon} ${action.bg} ${action.color}`}>
                  <Icon size={18} />
                </div>
                <span className={styles.actionOptionTitle}>{action.title}</span>
                <span className={styles.actionOptionDesc}>{action.desc}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
