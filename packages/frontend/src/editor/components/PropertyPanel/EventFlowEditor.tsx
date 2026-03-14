import { useState } from 'react';
import { MousePointerClick, Trash2, Plus, SlidersHorizontal } from 'lucide-react';
import type { Action } from '../../../types';
import { ACTION_TYPE, ActionType, ACTION_TYPE_CONFIG } from './actionConfig';
import {
  FeedbackActionEditor,
  SetValueActionEditor,
  ApiCallActionEditor,
  NavigateActionEditor,
  DialogActionEditor,
  DelayActionEditor,
  LogActionEditor,
  CustomScriptActionEditor,
  IfActionEditor,
  LoopActionEditor,
  UnsupportedActionEditor,
} from './actionEditors';
import styles from './PropertyPanel.module.scss';

interface EventTrigger {
  trigger: string;
  actions: Action[];
}

interface EventTriggerEditorProps {
  flow: EventTrigger;
  onOpenActionModal: (trigger: string) => void;
  onDeleteFlow: (trigger: string) => void;
  onDeleteAction: (trigger: string, actionIndex: number) => void;
  onUpdateAction: (trigger: string, actionIndex: number, nextAction: Action) => void;
}

export const EventFlowEditor = ({
  flow,
  onOpenActionModal,
  onDeleteFlow,
  onDeleteAction,
  onUpdateAction,
}: EventTriggerEditorProps) => {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const getActionIcon = (type: ActionType) => {
    const config = ACTION_TYPE_CONFIG[type];
    if (!config) return null;
    const Icon = config.icon;
    return (
      <div className={`${styles.actionIcon} ${config.bg} ${config.color}`}>
        <Icon width={14} height={14} />
      </div>
    );
  };

  const getActionSummary = (action: Action) => {
    const type = action.type;
    switch (type) {
      case ACTION_TYPE.setValue:
        return `设置 ${action.field}`;
      case ACTION_TYPE.apiCall:
        return `${(action.method || 'GET').toUpperCase()} ${String(action.url)}`;
      case ACTION_TYPE.navigate:
        return `跳转到 ${String(action.to)}`;
      case ACTION_TYPE.feedback:
        return `${action.level || 'info'}: ${String(action.content)}`;
      case ACTION_TYPE.dialog:
        return `${action.kind}: ${String(action.content)}`;
      case ACTION_TYPE.if:
        return `if (${String(action.condition)})`;
      case ACTION_TYPE.loop:
        return `loop (${String(action.over)})`;
      case ACTION_TYPE.delay:
        return `delay(${action.ms ?? 0}ms)`;
      case ACTION_TYPE.log:
        return `${action.level || 'info'}: ${String(action.value)}`;
      case ACTION_TYPE.customScript:
        return '// 自定义代码';
      default:
        return '请配置详细参数...';
    }
  };

  const renderActionEditor = (action: Action, index: number) => {
    const updateAction = (partial: Partial<Action>) => {
      onUpdateAction(flow.trigger, index, { ...action, ...partial } as Action);
    };

    switch (action.type) {
      case ACTION_TYPE.feedback:
        return <FeedbackActionEditor action={action} updateAction={updateAction} />;
      case ACTION_TYPE.setValue:
        return <SetValueActionEditor action={action} updateAction={updateAction} />;
      case ACTION_TYPE.apiCall:
        return <ApiCallActionEditor action={action} updateAction={updateAction} />;
      case ACTION_TYPE.navigate:
        return <NavigateActionEditor action={action} updateAction={updateAction} />;
      case ACTION_TYPE.dialog:
        return <DialogActionEditor action={action} updateAction={updateAction} />;
      case ACTION_TYPE.delay:
        return <DelayActionEditor action={action} updateAction={updateAction} />;
      case ACTION_TYPE.log:
        return <LogActionEditor action={action} updateAction={updateAction} />;
      case ACTION_TYPE.customScript:
        return <CustomScriptActionEditor action={action} updateAction={updateAction} />;
      case ACTION_TYPE.if:
        return <IfActionEditor action={action} updateAction={updateAction} />;
      case ACTION_TYPE.loop:
        return <LoopActionEditor action={action} updateAction={updateAction} />;
      default:
        return <UnsupportedActionEditor />;
    }
  };

  const toggleActionEditor = (index: number) => {
    setExpandedIndex((current) => (current === index ? null : index));
  };

  return (
    <div className={styles.eventFlow}>
      {/* Flow Header */}
      <div className={styles.flowHeader}>
        <div className={styles.flowTrigger}>
          <MousePointerClick width={16} height={16} className={styles.triggerIcon} />
          <span className={styles.triggerLabel}>{flow.trigger}</span>
        </div>
        <div className={styles.flowActions}>
          <button className={styles.flowActionBtn} onClick={() => onOpenActionModal(flow.trigger)}>
            <Plus width={14} height={14} />
          </button>
          <button
            className={`${styles.flowActionBtn} ${styles.delete}`}
            onClick={() => onDeleteFlow(flow.trigger)}
          >
            <Trash2 width={14} height={14} />
          </button>
        </div>
      </div>

      {/* Action Chain */}
      <div className={styles.actionChain}>
        {flow.actions.length === 0 ? (
          <div className={styles.emptyChain}>
            <p className={styles.emptyChainText}>暂无动作</p>
            <button
              className={styles.addFirstActionBtn}
              onClick={() => onOpenActionModal(flow.trigger)}
            >
              <Plus width={14} height={14} />
              添加第一个动作
            </button>
          </div>
        ) : (
          flow.actions.map((action, index) => (
            <div key={index} className={styles.actionNode}>
              <div className={styles.actionDot} />
              <div className={styles.actionCard}>
                <div className={styles.actionCardHeader}>
                  <div className={styles.actionTitle}>
                    {getActionIcon(action.type as ActionType)}
                    <span>
                      {ACTION_TYPE_CONFIG[action.type as ActionType]?.title || action.type}
                    </span>
                  </div>
                  <div className={styles.actionCardControls}>
                    <button
                      className={styles.actionConfigBtn}
                      onClick={() => toggleActionEditor(index)}
                    >
                      <SlidersHorizontal width={14} height={14} />
                      配置
                    </button>
                    <button
                      className={styles.deleteActionBtn}
                      onClick={() => onDeleteAction(flow.trigger, index)}
                    >
                      <Trash2 width={14} height={14} />
                    </button>
                  </div>
                </div>
                <div className={styles.actionSummary}>{getActionSummary(action)}</div>
                {expandedIndex === index && renderActionEditor(action, index)}
              </div>
            </div>
          ))
        )}

        {flow.actions.length > 0 && (
          <button className={styles.addActionBtn} onClick={() => onOpenActionModal(flow.trigger)}>
            <Plus width={14} height={14} />
            添加动作
          </button>
        )}
      </div>
    </div>
  );
};
