import React, { useCallback, useMemo } from 'react';
import { Button as AntButton, Space, Table as AntTable } from 'antd';
import type { EventDispatcher } from '../../renderer/EventDispatcher';
import { DSLExecutor } from '../../renderer/executor';
import { resolveValue } from '../../renderer/executor/parser/valueResolver';
import type { ActionList, ExecutionContext } from '../../types';
import {
  isTableActionColumn,
  isTableLinkColumn,
  sanitizeTableColumnsValue,
  type TableActionButtonType,
  type TableColumnItem,
} from '../../types';

/**
 * 表格组件
 */
export interface TableProps extends React.ComponentProps<typeof AntTable> {
  __eventDispatcher?: EventDispatcher;
  __componentId?: string;
}

const ACTION_BUTTON_TYPES: TableActionButtonType[] = ['text', 'link', 'primary', 'default'];

function createTableExecutionContext(
  eventDispatcher: EventDispatcher | undefined,
  extraContext: Record<string, unknown>,
): ExecutionContext {
  return DSLExecutor.createContext({
    ...(eventDispatcher?.getExecutionContext() ?? {}),
    ...extraContext,
  });
}

function stringifyCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

export const Table: React.FC<TableProps> = ({
  columns,
  __eventDispatcher,
  __componentId,
  ...props
}) => {
  const normalizedColumns = useMemo(() => sanitizeTableColumnsValue(columns), [columns]);

  const executeActions = useCallback(
    async (
      actions: ActionList,
      event: React.MouseEvent<HTMLElement>,
      record: Record<string, unknown>,
      value: unknown,
      rowIndex: number,
    ) => {
      event.preventDefault();
      event.stopPropagation();

      if (!__eventDispatcher || actions.length === 0) {
        return;
      }

      await __eventDispatcher.execute(actions, event.nativeEvent, {
        componentId: __componentId,
        record,
        rowIndex,
        value,
      });
    },
    [__componentId, __eventDispatcher],
  );

  const resolvedColumns = useMemo(() => {
    return normalizedColumns.map((column) => {
      if (isTableLinkColumn(column)) {
        return {
          ...column,
          render: (value: unknown, record: unknown, rowIndex: number) => {
            const rowRecord =
              record && typeof record === 'object' ? (record as Record<string, unknown>) : {};
            const rowContext = createTableExecutionContext(__eventDispatcher, {
              componentId: __componentId,
              record: rowRecord,
              rowIndex,
              value,
            });
            const text =
              column.textMode === 'template'
                ? stringifyCellValue(resolveValue(column.textTemplate ?? '{{value}}', rowContext))
                : stringifyCellValue(value);

            return (
              <AntButton
                type="link"
                size="small"
                onClick={(event) =>
                  executeActions(column.actions, event, rowRecord, value, rowIndex)
                }
                disabled={!__eventDispatcher || column.actions.length === 0}
                style={{ paddingInline: 0 }}
              >
                {text || '-'}
              </AntButton>
            );
          },
        };
      }

      if (isTableActionColumn(column)) {
        return {
          ...column,
          render: (_value: unknown, record: unknown, rowIndex: number) => {
            const rowRecord =
              record && typeof record === 'object' ? (record as Record<string, unknown>) : {};

            return (
              <Space size={4} wrap>
                {column.buttons.map((button, buttonIndex) => {
                  const buttonType = ACTION_BUTTON_TYPES.includes(button.buttonType ?? 'text')
                    ? (button.buttonType ?? 'text')
                    : 'text';

                  return (
                    <AntButton
                      key={`${button.label}-${buttonIndex}`}
                      type={buttonType}
                      size="small"
                      danger={button.danger}
                      onClick={(event) =>
                        executeActions(button.actions, event, rowRecord, undefined, rowIndex)
                      }
                      disabled={!__eventDispatcher || button.actions.length === 0}
                    >
                      {button.label}
                    </AntButton>
                  );
                })}
              </Space>
            );
          },
        };
      }

      const dataColumn = column as TableColumnItem & { dataIndex?: string };
      return {
        ...dataColumn,
        kind: 'data',
      };
    });
  }, [__componentId, __eventDispatcher, executeActions, normalizedColumns]);

  return (
    <AntTable
      {...props}
      columns={resolvedColumns as React.ComponentProps<typeof AntTable>['columns']}
    />
  );
};

Table.displayName = 'Table';

export default Table;
