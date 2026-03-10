import React, { useState } from 'react';
import {
  MousePointerClick,
  Trash2,
  Plus,
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
  SlidersHorizontal,
} from 'lucide-react';
import type { Action, Value } from '../../../types';
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

const ACTION_TYPE = {
  setValue: 'setValue',
  apiCall: 'apiCall',
  navigate: 'navigate',
  feedback: 'feedback',
  dialog: 'dialog',
  if: 'if',
  loop: 'loop',
  delay: 'delay',
  log: 'log',
  customScript: 'customScript',
} as const;

type ActionType = (typeof ACTION_TYPE)[keyof typeof ACTION_TYPE];
type ActionUpdate = (partial: Partial<Action>) => void;

type FeedbackActionItem = Extract<Action, { type: typeof ACTION_TYPE.feedback }>;
type SetValueActionItem = Extract<Action, { type: typeof ACTION_TYPE.setValue }>;
type ApiCallActionItem = Extract<Action, { type: typeof ACTION_TYPE.apiCall }>;
type NavigateActionItem = Extract<Action, { type: typeof ACTION_TYPE.navigate }>;
type DialogActionItem = Extract<Action, { type: typeof ACTION_TYPE.dialog }>;
type DelayActionItem = Extract<Action, { type: typeof ACTION_TYPE.delay }>;
type LogActionItem = Extract<Action, { type: typeof ACTION_TYPE.log }>;
type CustomScriptActionItem = Extract<Action, { type: typeof ACTION_TYPE.customScript }>;
type IfActionItem = Extract<Action, { type: typeof ACTION_TYPE.if }>;
type LoopActionItem = Extract<Action, { type: typeof ACTION_TYPE.loop }>;

const ACTION_TYPE_CONFIG: Record<
  ActionType,
  {
    icon: React.FC<React.SVGProps<SVGSVGElement>>;
    color: string;
    bg: string;
    title: string;
    desc: string;
  }
> = {
  [ACTION_TYPE.setValue]: {
    icon: Variable,
    color: 'text-blue-600',
    bg: 'bg-blue-100',
    title: '设置变量',
    desc: '设置字段/状态值',
  },
  [ACTION_TYPE.apiCall]: {
    icon: Database,
    color: 'text-purple-600',
    bg: 'bg-purple-100',
    title: 'API 请求',
    desc: '发送 HTTP 请求',
  },
  [ACTION_TYPE.navigate]: {
    icon: ArrowRight,
    color: 'text-emerald-600',
    bg: 'bg-emerald-100',
    title: '页面跳转',
    desc: '路由导航',
  },
  [ACTION_TYPE.feedback]: {
    icon: MessageSquare,
    color: 'text-amber-600',
    bg: 'bg-amber-100',
    title: '消息提示',
    desc: 'Toast 或弹窗提示',
  },
  [ACTION_TYPE.dialog]: {
    icon: LayoutTemplate,
    color: 'text-pink-600',
    bg: 'bg-pink-100',
    title: '控制弹窗',
    desc: '打开或关闭页面弹窗',
  },
  [ACTION_TYPE.if]: {
    icon: Equal,
    color: 'text-cyan-600',
    bg: 'bg-cyan-100',
    title: '条件判断',
    desc: 'If/Else 逻辑分支',
  },
  [ACTION_TYPE.loop]: {
    icon: RotateCcw,
    color: 'text-indigo-600',
    bg: 'bg-indigo-100',
    title: '循环',
    desc: '遍历数组执行动作',
  },
  [ACTION_TYPE.delay]: {
    icon: Clock,
    color: 'text-orange-600',
    bg: 'bg-orange-100',
    title: '延迟',
    desc: '延时执行后续动作',
  },
  [ACTION_TYPE.log]: {
    icon: FileText,
    color: 'text-slate-600',
    bg: 'bg-slate-100',
    title: '日志',
    desc: '输出调试日志',
  },
  [ACTION_TYPE.customScript]: {
    icon: Code,
    color: 'text-red-600',
    bg: 'bg-red-100',
    title: '自定义脚本',
    desc: '执行 JavaScript',
  },
};

const formatValue = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const MAX_VALUE_INPUT_LENGTH = 5000;

const parseValueInput = (input: string): Value => {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (trimmed.length > MAX_VALUE_INPUT_LENGTH) return input;
  try {
    return JSON.parse(trimmed) as Value;
  } catch {
    return input;
  }
};

const parseNumberInput = (input: string): number | undefined => {
  if (!input.trim()) return undefined;
  const num = Number(input);
  return Number.isNaN(num) ? undefined : num;
};

const FeedbackActionEditor = ({
  action,
  updateAction,
}: {
  action: FeedbackActionItem;
  updateAction: ActionUpdate;
}) => {
  const kind = action.kind ?? 'message';
  const level = action.level ?? 'info';
  return (
    <div className={styles.actionEditor}>
      <div className={styles.actionFieldRow}>
        <div className={styles.actionField}>
          <label>提示类型</label>
          <select
            value={kind}
            aria-label="提示类型"
            onChange={(event) =>
              updateAction({
                kind: event.target.value as 'message' | 'notification',
              })
            }
          >
            <option value="message">message</option>
            <option value="notification">notification</option>
          </select>
        </div>
        <div className={styles.actionField}>
          <label>消息级别</label>
          <select
            value={level}
            aria-label="消息级别"
            onChange={(event) =>
              updateAction({
                level: event.target.value as 'success' | 'error' | 'warning' | 'info',
              })
            }
          >
            <option value="success">success</option>
            <option value="error">error</option>
            <option value="warning">warning</option>
            <option value="info">info</option>
          </select>
        </div>
      </div>
      <div className={styles.actionField}>
        <label>提示内容</label>
        <input
          value={formatValue(action.content)}
          aria-label="提示内容"
          onChange={(event) => updateAction({ content: parseValueInput(event.target.value) })}
        />
      </div>
      {kind === 'notification' && (
        <div className={styles.actionField}>
          <label>标题</label>
          <input
            value={formatValue(action.title)}
            aria-label="提示标题"
            onChange={(event) => updateAction({ title: parseValueInput(event.target.value) })}
          />
        </div>
      )}
    </div>
  );
};

const SetValueActionEditor = ({
  action,
  updateAction,
}: {
  action: SetValueActionItem;
  updateAction: ActionUpdate;
}) => (
  <div className={styles.actionEditor}>
    <div className={styles.actionField}>
      <label>字段路径</label>
      <input
        value={action.field}
        aria-label="字段路径"
        onChange={(event) => updateAction({ field: event.target.value })}
      />
    </div>
    <div className={styles.actionField}>
      <label>值</label>
      <input
        value={formatValue(action.value)}
        aria-label="字段值"
        onChange={(event) => updateAction({ value: parseValueInput(event.target.value) })}
      />
    </div>
    <label className={styles.checkboxInline}>
      <input
        type="checkbox"
        aria-label="合并对象"
        checked={Boolean(action.merge)}
        onChange={(event) => updateAction({ merge: event.target.checked })}
      />
      合并对象
    </label>
  </div>
);

const ApiCallActionEditor = ({
  action,
  updateAction,
}: {
  action: ApiCallActionItem;
  updateAction: ActionUpdate;
}) => (
  <div className={styles.actionEditor}>
    <div className={styles.actionField}>
      <label>接口地址</label>
      <input
        value={formatValue(action.url)}
        aria-label="接口地址"
        onChange={(event) => updateAction({ url: parseValueInput(event.target.value) })}
      />
    </div>
    <div className={styles.actionFieldRow}>
      <div className={styles.actionField}>
        <label>方法</label>
        <select
          value={action.method ?? 'GET'}
          aria-label="请求方法"
          onChange={(event) =>
            updateAction({
              method: event.target.value as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
            })
          }
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
          <option value="PATCH">PATCH</option>
        </select>
      </div>
      <label className={styles.checkboxInline}>
        <input
          type="checkbox"
          aria-label="自动提示错误"
          checked={Boolean(action.showError)}
          onChange={(event) => updateAction({ showError: event.target.checked })}
        />
        自动提示错误
      </label>
    </div>
  </div>
);

const NavigateActionEditor = ({
  action,
  updateAction,
}: {
  action: NavigateActionItem;
  updateAction: ActionUpdate;
}) => (
  <div className={styles.actionEditor}>
    <div className={styles.actionField}>
      <label>跳转地址</label>
      <input
        value={formatValue(action.to)}
        aria-label="跳转地址"
        onChange={(event) => updateAction({ to: parseValueInput(event.target.value) })}
      />
    </div>
    <label className={styles.checkboxInline}>
      <input
        type="checkbox"
        aria-label="替换历史"
        checked={Boolean(action.replace)}
        onChange={(event) => updateAction({ replace: event.target.checked })}
      />
      替换历史记录
    </label>
  </div>
);

const DialogActionEditor = ({
  action,
  updateAction,
}: {
  action: DialogActionItem;
  updateAction: ActionUpdate;
}) => (
  <div className={styles.actionEditor}>
    <div className={styles.actionFieldRow}>
      <div className={styles.actionField}>
        <label>弹窗类型</label>
        <select
          value={action.kind}
          aria-label="弹窗类型"
          onChange={(event) =>
            updateAction({
              kind: event.target.value as 'modal' | 'confirm',
            })
          }
        >
          <option value="modal">modal</option>
          <option value="confirm">confirm</option>
        </select>
      </div>
      <div className={styles.actionField}>
        <label>标题</label>
        <input
          value={formatValue(action.title)}
          aria-label="弹窗标题"
          onChange={(event) => updateAction({ title: parseValueInput(event.target.value) })}
        />
      </div>
    </div>
    <div className={styles.actionField}>
      <label>内容</label>
      <input
        value={formatValue(action.content)}
        aria-label="弹窗内容"
        onChange={(event) => updateAction({ content: parseValueInput(event.target.value) })}
      />
    </div>
  </div>
);

const DelayActionEditor = ({
  action,
  updateAction,
}: {
  action: DelayActionItem;
  updateAction: ActionUpdate;
}) => (
  <div className={styles.actionEditor}>
    <div className={styles.actionField}>
      <label>延迟时间(ms)</label>
      <input
        type="number"
        aria-label="延迟时间"
        value={action.ms ?? ''}
        onChange={(event) => {
          const next = parseNumberInput(event.target.value);
          updateAction(next === undefined ? { ms: undefined } : { ms: next });
        }}
      />
    </div>
  </div>
);

const LogActionEditor = ({
  action,
  updateAction,
}: {
  action: LogActionItem;
  updateAction: ActionUpdate;
}) => (
  <div className={styles.actionEditor}>
    <div className={styles.actionFieldRow}>
      <div className={styles.actionField}>
        <label>日志级别</label>
        <select
          value={action.level ?? 'info'}
          aria-label="日志级别"
          onChange={(event) =>
            updateAction({
              level: event.target.value as 'log' | 'info' | 'warn' | 'error',
            })
          }
        >
          <option value="log">log</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
        </select>
      </div>
      <div className={styles.actionField}>
        <label>日志内容</label>
        <input
          value={formatValue(action.value)}
          aria-label="日志内容"
          onChange={(event) => updateAction({ value: parseValueInput(event.target.value) })}
        />
      </div>
    </div>
  </div>
);

const CustomScriptActionEditor = ({
  action,
  updateAction,
}: {
  action: CustomScriptActionItem;
  updateAction: ActionUpdate;
}) => (
  <div className={styles.actionEditor}>
    <div className={styles.actionField}>
      <label>脚本内容</label>
      <textarea
        value={action.code}
        aria-label="脚本内容"
        onChange={(event) => updateAction({ code: event.target.value })}
      />
    </div>
  </div>
);

const IfActionEditor = ({
  action,
  updateAction,
}: {
  action: IfActionItem;
  updateAction: ActionUpdate;
}) => (
  <div className={styles.actionEditor}>
    <div className={styles.actionField}>
      <label>条件</label>
      <input
        value={formatValue(action.condition)}
        aria-label="条件表达式"
        onChange={(event) => updateAction({ condition: parseValueInput(event.target.value) })}
      />
    </div>
    <div className={styles.actionHint}>子动作请在 JSON 模式下编辑</div>
  </div>
);

const LoopActionEditor = ({
  action,
  updateAction,
}: {
  action: LoopActionItem;
  updateAction: ActionUpdate;
}) => (
  <div className={styles.actionEditor}>
    <div className={styles.actionField}>
      <label>遍历数据</label>
      <input
        value={formatValue(action.over)}
        aria-label="遍历数据"
        onChange={(event) => updateAction({ over: parseValueInput(event.target.value) })}
      />
    </div>
    <div className={styles.actionFieldRow}>
      <div className={styles.actionField}>
        <label>元素变量</label>
        <input
          value={action.itemVar}
          aria-label="元素变量"
          onChange={(event) => updateAction({ itemVar: event.target.value })}
        />
      </div>
      <div className={styles.actionField}>
        <label>索引变量</label>
        <input
          value={formatValue(action.indexVar)}
          aria-label="索引变量"
          onChange={(event) => updateAction({ indexVar: parseValueInput(event.target.value) })}
        />
      </div>
    </div>
    <div className={styles.actionHint}>子动作请在 JSON 模式下编辑</div>
  </div>
);

const UnsupportedActionEditor = () => (
  <div className={styles.actionEditor}>
    <div className={styles.actionHint}>该动作暂未提供可视化配置</div>
  </div>
);

export const EventFlowEditor: React.FC<EventTriggerEditorProps> = ({
  flow,
  onOpenActionModal,
  onDeleteFlow,
  onDeleteAction,
  onUpdateAction,
}) => {
  // flow.trigger 是只读的，因为它是 events 对象的 key
  // 如果要修改 trigger，需要删除旧的 key 并创建新的 key

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
    // 根据 action 类型返回不同的摘要
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
        return (
          <FeedbackActionEditor action={action as FeedbackActionItem} updateAction={updateAction} />
        );
      case ACTION_TYPE.setValue:
        return (
          <SetValueActionEditor action={action as SetValueActionItem} updateAction={updateAction} />
        );
      case ACTION_TYPE.apiCall:
        return (
          <ApiCallActionEditor action={action as ApiCallActionItem} updateAction={updateAction} />
        );
      case ACTION_TYPE.navigate:
        return (
          <NavigateActionEditor action={action as NavigateActionItem} updateAction={updateAction} />
        );
      case ACTION_TYPE.dialog:
        return (
          <DialogActionEditor action={action as DialogActionItem} updateAction={updateAction} />
        );
      case ACTION_TYPE.delay:
        return <DelayActionEditor action={action as DelayActionItem} updateAction={updateAction} />;
      case ACTION_TYPE.log:
        return <LogActionEditor action={action as LogActionItem} updateAction={updateAction} />;
      case ACTION_TYPE.customScript:
        return (
          <CustomScriptActionEditor
            action={action as CustomScriptActionItem}
            updateAction={updateAction}
          />
        );
      case ACTION_TYPE.if:
        return <IfActionEditor action={action as IfActionItem} updateAction={updateAction} />;
      case ACTION_TYPE.loop:
        return <LoopActionEditor action={action as LoopActionItem} updateAction={updateAction} />;
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
                    {getActionIcon(action.type)}
                    <span>{ACTION_TYPE_CONFIG[action.type]?.title || action.type}</span>
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
