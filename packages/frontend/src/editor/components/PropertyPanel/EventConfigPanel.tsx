import React, { useState, useCallback, useMemo } from 'react';
import type { A2UISchema, Action, ActionList } from '../../../types';
import { EventFlowEditor } from './EventFlowEditor';
import { ActionSelectorModal } from './ActionSelectorModal';
import { TriggerSelectorModal } from './TriggerSelectorModal';
import { NoSelectionEmptyState } from '../EmptyState';
import styles from './PropertyPanel.module.scss';

interface EventTriggerItem {
  trigger: string;
  actions: ActionList;
}

interface EventConfigPanelProps {
  schema: A2UISchema | null;
  selectedId: string | null;
  onSchemaChange: (schema: A2UISchema) => void;
}

/**
 * 事件配置面板
 * 直接以 trigger 为 key 管理事件，每个 trigger 对应一个 actions 数组
 */
export const EventConfigPanel: React.FC<EventConfigPanelProps> = ({
  schema,
  selectedId,
  onSchemaChange,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTriggerModalOpen, setIsTriggerModalOpen] = useState(false);
  const [activeTrigger, setActiveTrigger] = useState<string | null>(null);

  // 获取当前组件的事件配置
  const component = schema && selectedId ? schema.components[selectedId] : null;
  const events = useMemo(() => component?.events || {}, [component]);

  // 添加新事件流（打开触发器选择器）
  const handleAddEventFlow = useCallback(() => {
    setIsTriggerModalOpen(true);
  }, []);

  // 确认添加事件流（用户选择了触发器类型）
  const handleConfirmAddFlow = useCallback(
    (trigger: string) => {
      if (!schema || !selectedId) return;

      // 检查该 trigger 是否已存在
      if (events[trigger]) {
        setIsTriggerModalOpen(false);
        return;
      }

      const newSchema: A2UISchema = {
        ...schema,
        components: {
          ...schema.components,
          [selectedId]: {
            ...schema.components[selectedId],
            events: {
              ...schema.components[selectedId]?.events,
              [trigger]: [] as ActionList,
            },
          },
        },
      };
      onSchemaChange(newSchema);
      setIsTriggerModalOpen(false);
    },
    [schema, selectedId, events, onSchemaChange],
  );

  // 删除事件流
  const handleDeleteFlow = useCallback(
    (trigger: string) => {
      if (!schema || !selectedId) return;

      const newEvents = { ...events };
      delete newEvents[trigger];

      const newSchema: A2UISchema = {
        ...schema,
        components: {
          ...schema.components,
          [selectedId]: {
            ...schema.components[selectedId],
            events: newEvents,
          },
        },
      };
      onSchemaChange(newSchema);
    },
    [schema, selectedId, events, onSchemaChange],
  );

  // 打开动作选择器
  const handleOpenActionModal = useCallback((trigger: string) => {
    setActiveTrigger(trigger);
    setIsModalOpen(true);
  }, []);

  // 添加动作到事件流
  const handleAddAction = useCallback(
    (actionType: string) => {
      if (!schema || !selectedId || !activeTrigger) return;

      // 创建默认动作
      const newAction: Action = {
        type: actionType as Action['type'],
        // 根据类型设置默认值
        ...(actionType === 'setValue' && {
          field: 'targetField',
          value: 'defaultValue',
        }),
        ...(actionType === 'feedback' && {
          kind: 'message',
          content: '操作成功',
          level: 'success' as const,
        }),
        ...(actionType === 'apiCall' && {
          url: '/api/endpoint',
          method: 'GET' as const,
        }),
        ...(actionType === 'navigate' && {
          to: '/new-page',
        }),
        ...(actionType === 'dialog' && {
          kind: 'modal' as const,
          title: '弹窗标题',
          content: '弹窗内容',
        }),
        ...(actionType === 'if' && {
          condition: { type: 'literal', value: true },
          then: [],
        }),
        ...(actionType === 'loop' && {
          over: { type: 'literal', value: [] },
          itemVar: 'item',
          actions: [],
        }),
        ...(actionType === 'delay' && {
          ms: 1000,
        }),
        ...(actionType === 'log' && {
          value: { type: 'literal', value: 'Debug log' },
          level: 'info' as const,
        }),
        ...(actionType === 'customScript' && {
          code: '// 输入自定义 JavaScript 代码',
        }),
      } as Action;

      const currentActions = events[activeTrigger] || [];

      const newSchema: A2UISchema = {
        ...schema,
        components: {
          ...schema.components,
          [selectedId]: {
            ...schema.components[selectedId],
            events: {
              ...schema.components[selectedId]?.events,
              [activeTrigger]: [...currentActions, newAction],
            },
          },
        },
      };
      onSchemaChange(newSchema);
      setIsModalOpen(false);
    },
    [schema, selectedId, activeTrigger, events, onSchemaChange],
  );

  // 删除动作
  const handleDeleteAction = useCallback(
    (trigger: string, actionIndex: number) => {
      if (!schema || !selectedId) return;

      const currentActions = events[trigger] || [];
      const newActions = currentActions.filter((_, idx) => idx !== actionIndex);

      const newSchema: A2UISchema = {
        ...schema,
        components: {
          ...schema.components,
          [selectedId]: {
            ...schema.components[selectedId],
            events: {
              ...schema.components[selectedId]?.events,
              [trigger]: newActions,
            },
          },
        },
      };
      onSchemaChange(newSchema);
    },
    [schema, selectedId, events, onSchemaChange],
  );

  const handleUpdateAction = useCallback(
    (trigger: string, actionIndex: number, nextAction: Action) => {
      if (!schema || !selectedId) return;

      const currentActions = events[trigger] || [];
      const newActions = currentActions.map((action, idx) =>
        idx === actionIndex ? nextAction : action,
      );

      const newSchema: A2UISchema = {
        ...schema,
        components: {
          ...schema.components,
          [selectedId]: {
            ...schema.components[selectedId],
            events: {
              ...schema.components[selectedId]?.events,
              [trigger]: newActions,
            },
          },
        },
      };
      onSchemaChange(newSchema);
    },
    [schema, selectedId, events, onSchemaChange],
  );

  // 空状态
  if (!schema || !selectedId) {
    return (
      <div className={styles.eventConfigPanel}>
        <NoSelectionEmptyState />
      </div>
    );
  }

  // 将 events 对象转换为数组格式供渲染
  const eventFlows: EventTriggerItem[] = useMemo(() => {
    return Object.entries(events).map(([trigger, actions]) => ({
      trigger,
      actions,
    }));
  }, [events]);

  return (
    <div className={styles.eventConfigPanel}>
      {/* 事件流列表 */}
      <div className={styles.flowList}>
        {eventFlows.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyText}>暂无事件配置</p>
            <p className={styles.emptyHint}>点击下方按钮添加事件监听</p>
          </div>
        ) : (
          eventFlows.map((flow) => (
            <EventFlowEditor
              key={flow.trigger}
              flow={flow}
              onOpenActionModal={handleOpenActionModal}
              onDeleteFlow={handleDeleteFlow}
              onDeleteAction={handleDeleteAction}
              onUpdateAction={handleUpdateAction}
            />
          ))
        )}
      </div>

      {/* 添加事件流按钮 */}
      <button className={styles.addFlowButton} onClick={handleAddEventFlow}>
        添加事件监听
      </button>

      {/* 动作选择器弹窗 */}
      {isModalOpen && (
        <ActionSelectorModal onClose={() => setIsModalOpen(false)} onSelect={handleAddAction} />
      )}

      {/* 触发器选择器弹窗 */}
      {isTriggerModalOpen && (
        <TriggerSelectorModal
          onClose={() => setIsTriggerModalOpen(false)}
          onSelect={handleConfirmAddFlow}
        />
      )}
    </div>
  );
};
