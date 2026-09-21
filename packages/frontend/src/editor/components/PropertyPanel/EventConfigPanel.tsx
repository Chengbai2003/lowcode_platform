import React, { useState, useCallback, useMemo } from 'react';
import type { PageSchema, Action, ActionList } from '../../../types';
import type { JsonValue } from '@lowcode-platform/schema-contract';
import { EventFlowEditor } from './EventFlowEditor';
import { ActionSelectorModal } from './ActionSelectorModal';
import { TriggerSelectorModal } from './TriggerSelectorModal';
import type { DataSourceEditorContext } from './actionEditors';
import { NoSelectionEmptyState } from '../EmptyState';
import styles from './PropertyPanel.module.scss';

interface EventTriggerItem {
  trigger: string;
  actions: ActionList;
}

/** 最小查询配置的缺省脚手架（PR D）：引用唯一注册的受信 demo 操作 */
const DEFAULT_DATASOURCE_SOURCE_ID = 'searchItems';
const DEFAULT_DATASOURCE_RESULT_STATE_KEY = 'rows';
const DEFAULT_DATASOURCE_OPERATION_ID = 'demo.items.search';
const DEFAULT_DATASOURCE_OPERATION_REVISION = '1';

interface EventConfigPanelProps {
  schema: PageSchema | null;
  selectedId: string | null;
  onSchemaChange: (schema: PageSchema) => void;
  /** PR D：数据源动作编辑上下文（目录 + 脏页提示），由编辑器顶层透传 */
  dataSourceEditor?: DataSourceEditorContext;
}

/**
 * 事件配置面板
 * 直接以 trigger 为 key 管理事件，每个 trigger 对应一个 actions 数组
 */
export const EventConfigPanel: React.FC<EventConfigPanelProps> = ({
  schema,
  selectedId,
  onSchemaChange,
  dataSourceEditor,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTriggerModalOpen, setIsTriggerModalOpen] = useState(false);
  const [activeTrigger, setActiveTrigger] = useState<string | null>(null);

  // 获取当前组件的事件配置
  const component = schema && selectedId ? schema.components[selectedId] : null;
  const events = useMemo(() => component?.events || {}, [component]);
  const flowKeys = useMemo(() => Object.keys(schema?.logic?.flows ?? {}), [schema?.logic?.flows]);
  const dataSourceKeys = useMemo(
    () => Object.keys(schema?.logic?.dataSources ?? {}),
    [schema?.logic?.dataSources],
  );
  const stateKeys = useMemo(
    () => Object.keys(schema?.logic?.states ?? {}),
    [schema?.logic?.states],
  );

  // PR D：内联新建数据源声明 / 顶层 state（经既有 onSchemaChange 通道，不改持久化协议）
  const handleCreateDataSourceDeclaration = useCallback(
    (draft: {
      sourceId: string;
      operationId: string;
      revision: string;
      params?: Record<string, JsonValue>;
    }) => {
      if (!schema || !draft.sourceId.trim()) return;
      const logic = schema.logic ?? {};
      const nextLogic = {
        ...logic,
        dataSources: {
          ...logic.dataSources,
          [draft.sourceId.trim()]: {
            operationRef: { operationId: draft.operationId, revision: draft.revision },
            ...(draft.params !== undefined ? { params: draft.params } : {}),
          },
        },
      };
      onSchemaChange({ ...schema, logic: nextLogic });
    },
    [schema, onSchemaChange],
  );

  const handleCreateState = useCallback(
    (key: string) => {
      if (!schema || !key.trim()) return;
      const logic = schema.logic ?? {};
      const nextLogic = {
        ...logic,
        states: { ...logic.states, [key.trim()]: [] },
      };
      onSchemaChange({ ...schema, logic: nextLogic });
    },
    [schema, onSchemaChange],
  );

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

      const newSchema: PageSchema = {
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

      const newSchema: PageSchema = {
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
        ...(actionType === 'runFlow' && {
          flow: flowKeys[0],
        }),
        ...(actionType === 'executeDataSource' && {
          sourceId: DEFAULT_DATASOURCE_SOURCE_ID,
          resultTo: `state.${DEFAULT_DATASOURCE_RESULT_STATE_KEY}`,
        }),
      } as Action;

      const currentActions = events[activeTrigger] || [];

      // PR D：executeDataSource 需要合法引用——缺省脚手架一次成型
      // （声明 + 顶层 state + 动作），避免中间态产生非法 schema。
      // 脚手架引用唯一注册的受信 demo 操作；目录内其他操作经「新建查询」配置。
      const needsScaffold = actionType === 'executeDataSource';
      const nextLogic = needsScaffold
        ? {
            ...schema.logic,
            states: {
              ...schema.logic?.states,
              [DEFAULT_DATASOURCE_RESULT_STATE_KEY]:
                schema.logic?.states?.[DEFAULT_DATASOURCE_RESULT_STATE_KEY] ?? [],
            },
            dataSources: {
              ...schema.logic?.dataSources,
              [DEFAULT_DATASOURCE_SOURCE_ID]: schema.logic?.dataSources?.[
                DEFAULT_DATASOURCE_SOURCE_ID
              ] ?? {
                operationRef: {
                  operationId: DEFAULT_DATASOURCE_OPERATION_ID,
                  revision: DEFAULT_DATASOURCE_OPERATION_REVISION,
                },
              },
            },
          }
        : schema.logic;

      const newSchema: PageSchema = {
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
        ...(nextLogic !== schema.logic ? { logic: nextLogic } : {}),
      };
      onSchemaChange(newSchema);
      setIsModalOpen(false);
    },
    [schema, selectedId, activeTrigger, events, flowKeys, onSchemaChange],
  );

  // 删除动作
  const handleDeleteAction = useCallback(
    (trigger: string, actionIndex: number) => {
      if (!schema || !selectedId) return;

      const currentActions = events[trigger] || [];
      const newActions = currentActions.filter((_, idx) => idx !== actionIndex);

      const newSchema: PageSchema = {
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

      const newSchema: PageSchema = {
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
              flowKeys={flowKeys}
              dataSourceKeys={dataSourceKeys}
              stateKeys={stateKeys}
              dataSourceEditor={dataSourceEditor}
              onCreateDataSourceDeclaration={handleCreateDataSourceDeclaration}
              onCreateState={handleCreateState}
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
        <ActionSelectorModal
          onClose={() => setIsModalOpen(false)}
          onSelect={handleAddAction}
          flowKeys={flowKeys}
        />
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
