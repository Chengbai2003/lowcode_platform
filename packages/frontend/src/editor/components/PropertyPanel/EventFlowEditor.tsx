import React from "react";
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
} from "lucide-react";
import type { Action } from "../../../types";
import styles from "./PropertyPanel.module.scss";

interface EventTrigger {
  trigger: string;
  actions: Action[];
}

interface EventTriggerEditorProps {
  flow: EventTrigger;
  onOpenActionModal: (trigger: string) => void;
  onDeleteFlow: (trigger: string) => void;
  onDeleteAction: (trigger: string, actionIndex: number) => void;
}

const ACTION_TYPE_CONFIG: Record<string, { icon: React.FC<React.SVGProps<SVGSVGElement>>; color: string; bg: string; title: string; desc: string }> = {
  setValue: { icon: Variable, color: "text-blue-600", bg: "bg-blue-100", title: "设置变量", desc: "设置字段/状态值" },
  apiCall: { icon: Database, color: "text-purple-600", bg: "bg-purple-100", title: "API 请求", desc: "发送 HTTP 请求" },
  navigate: { icon: ArrowRight, color: "text-emerald-600", bg: "bg-emerald-100", title: "页面跳转", desc: "路由导航" },
  feedback: { icon: MessageSquare, color: "text-amber-600", bg: "bg-amber-100", title: "消息提示", desc: "Toast 或弹窗提示" },
  dialog: { icon: LayoutTemplate, color: "text-pink-600", bg: "bg-pink-100", title: "控制弹窗", desc: "打开或关闭页面弹窗" },
  if: { icon: Equal, color: "text-cyan-600", bg: "bg-cyan-100", title: "条件判断", desc: "If/Else 逻辑分支" },
  loop: { icon: RotateCcw, color: "text-indigo-600", bg: "bg-indigo-100", title: "循环", desc: "遍历数组执行动作" },
  delay: { icon: Clock, color: "text-orange-600", bg: "bg-orange-100", title: "延迟", desc: "延时执行后续动作" },
  log: { icon: FileText, color: "text-slate-600", bg: "bg-slate-100", title: "日志", desc: "输出调试日志" },
  customScript: { icon: Code, color: "text-red-600", bg: "bg-red-100", title: "自定义脚本", desc: "执行 JavaScript" },
};

export const EventFlowEditor: React.FC<EventTriggerEditorProps> = ({
  flow,
  onOpenActionModal,
  onDeleteFlow,
  onDeleteAction,
}) => {
  // flow.trigger 是只读的，因为它是 events 对象的 key
  // 如果要修改 trigger，需要删除旧的 key 并创建新的 key

  const getActionIcon = (type: string) => {
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
      case "setValue":
        return "设置变量值";
      case "apiCall":
        return "POST /api/endpoint";
      case "navigate":
        return "跳转到新页面";
      case "feedback":
        return "Success: 操作成功";
      case "dialog":
        return "打开弹窗";
      case "if":
        return "if (condition)";
      case "loop":
        return "loop (items)";
      case "delay":
        return "delay(1000ms)";
      case "log":
        return "log('message')";
      case "customScript":
        return "// 自定义代码";
      default:
        return "请配置详细参数...";
    }
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
          <button
            className={styles.flowActionBtn}
            onClick={() => onOpenActionModal(flow.trigger)}
          >
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
                  <button
                    className={styles.deleteActionBtn}
                    onClick={() => onDeleteAction(flow.trigger, index)}
                  >
                    <Trash2 width={14} height={14} />
                  </button>
                </div>
                <div className={styles.actionSummary}>
                  {getActionSummary(action)}
                </div>
              </div>
            </div>
          ))
        )}

        {flow.actions.length > 0 && (
          <button
            className={styles.addActionBtn}
            onClick={() => onOpenActionModal(flow.trigger)}
          >
            <Plus width={14} height={14} />
            添加动作
          </button>
        )}
      </div>
    </div>
  );
};
