import React, { useCallback, useMemo } from 'react';
import { Button as AntButton, Space, Table as AntTable } from 'antd';
import { useComponentRuntimeBridge } from '@lowcode-platform/renderer';
import type { ActionList } from '../../types';
import {
  isTableActionColumn,
  isTableLinkColumn,
  sanitizeTableColumnsValue,
  type TableActionButtonType,
  type TableColumnItem,
} from '../../types';

/**
 * 表格组件
 *
 * 通过 ComponentRuntimeBridge 消费渲染器受控能力（M0-4 Scope C），
 * 不再直接依赖渲染器内部执行器实现。
 */
export interface TableProps extends React.ComponentProps<typeof AntTable> {
  __componentId?: string;
}

const ACTION_BUTTON_TYPES: TableActionButtonType[] = ['text', 'link', 'primary', 'default'];

function stringifyCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

export const Table: React.FC<TableProps> = ({ columns, __componentId, ...props }) => {
  const bridge = useComponentRuntimeBridge();
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

      if (!bridge || actions.length === 0) {
        return;
      }

      await bridge.executeActions(actions, event.nativeEvent, {
        componentId: __componentId,
        record,
        rowIndex,
        value,
      });
    },
    [__componentId, bridge],
  );

  const resolvedColumns = useMemo(() => {
    return normalizedColumns.map((column) => {
      if (isTableLinkColumn(column)) {
        return {
          ...column,
          render: (value: unknown, record: unknown, rowIndex: number) => {
            const rowRecord =
              record && typeof record === 'object' ? (record as Record<string, unknown>) : {};
            const text =
              column.textMode === 'template'
                ? stringifyCellValue(
                    bridge?.resolveValue(column.textTemplate ?? '{{value}}', {
                      componentId: __componentId,
                      record: rowRecord,
                      rowIndex,
                      value,
                    }),
                  )
                : stringifyCellValue(value);

            return (
              <AntButton
                type="link"
                size="small"
                onClick={(event) =>
                  executeActions(column.actions, event, rowRecord, value, rowIndex)
                }
                disabled={!bridge || column.actions.length === 0}
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
                      disabled={!bridge || button.actions.length === 0}
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
  }, [__componentId, bridge, executeActions, normalizedColumns]);

  return (
    <AntTable
      {...props}
      columns={resolvedColumns as React.ComponentProps<typeof AntTable>['columns']}
    />
  );
};

Table.displayName = 'Table';

export default Table;
