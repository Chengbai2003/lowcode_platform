import React, { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { A2UISchema, FeedbackAction } from '../../../types';
import { EventConfigPanel } from './EventConfigPanel';

const createSchema = (): A2UISchema => ({
  rootId: 'button-1',
  components: {
    'button-1': {
      id: 'button-1',
      type: 'Button',
      props: {
        children: '按钮',
      },
      childrenIds: [],
      events: {},
    },
  },
});

interface StatefulPanelProps {
  initialSchema: A2UISchema;
  selectedId: string;
  onSchemaChange: (schema: A2UISchema) => void;
}

const StatefulPanel: React.FC<StatefulPanelProps> = ({
  initialSchema,
  selectedId,
  onSchemaChange,
}) => {
  const [schema, setSchema] = useState(initialSchema);

  return (
    <EventConfigPanel
      schema={schema}
      selectedId={selectedId}
      onSchemaChange={(nextSchema) => {
        setSchema(nextSchema);
        onSchemaChange(nextSchema);
      }}
    />
  );
};

describe('EventConfigPanel', () => {
  it('edits feedback action and persists after remount', () => {
    let latestSchema = createSchema();

    const { unmount } = render(
      <StatefulPanel
        initialSchema={latestSchema}
        selectedId="button-1"
        onSchemaChange={(schema) => {
          latestSchema = schema;
        }}
      />,
    );

    fireEvent.click(screen.getByText('添加事件监听'));
    fireEvent.click(screen.getByText('onClick'));

    fireEvent.click(screen.getByText('添加第一个动作'));
    fireEvent.click(screen.getByText('消息提示'));

    fireEvent.click(screen.getByText('配置'));

    fireEvent.change(screen.getByLabelText('消息级别'), {
      target: { value: 'error' },
    });

    fireEvent.change(screen.getByLabelText('提示内容'), {
      target: { value: '操作失败' },
    });

    const action = latestSchema.components['button-1'].events?.onClick?.[0] as
      | FeedbackAction
      | undefined;
    expect(action?.level).toBe('error');
    expect(action?.content).toBe('操作失败');

    unmount();

    render(
      <StatefulPanel
        initialSchema={latestSchema}
        selectedId="button-1"
        onSchemaChange={(schema) => {
          latestSchema = schema;
        }}
      />,
    );

    fireEvent.click(screen.getByText('配置'));

    expect((screen.getByLabelText('消息级别') as HTMLSelectElement).value).toBe('error');
    expect((screen.getByLabelText('提示内容') as HTMLInputElement).value).toBe('操作失败');
  });
});
