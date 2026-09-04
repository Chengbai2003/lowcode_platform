import React, { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { validatePageSchemaValue } from '@lowcode-platform/schema-contract';
import type { PageSchema, FeedbackAction } from '../../../types';
import { EventConfigPanel } from './EventConfigPanel';

const createSchema = (): PageSchema => ({
  schemaVersion: 0,
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
  initialSchema: PageSchema;
  selectedId: string;
  onSchemaChange: (schema: PageSchema) => void;
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

  it('disables runFlow when the page has no declared flows', () => {
    render(
      <StatefulPanel
        initialSchema={createSchema()}
        selectedId="button-1"
        onSchemaChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByText('添加事件监听'));
    fireEvent.click(screen.getByText('onClick'));
    fireEvent.click(screen.getByText('添加第一个动作'));

    const runFlow = screen.getByRole('button', { name: /运行流程/u });
    expect(runFlow).toBeDisabled();
    expect(runFlow).toHaveAttribute('title', '请先在页面逻辑中声明 ActionFlow');
  });

  it('authors a declared runFlow input and preserves it after remount', () => {
    let latestSchema: PageSchema = {
      ...createSchema(),
      logic: {
        flows: {
          submitOrder: { steps: [{ type: 'feedback', kind: 'message', content: 'ok' }] },
        },
      },
    };
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
    fireEvent.click(screen.getByRole('button', { name: /运行流程/u }));
    fireEvent.click(screen.getByText('配置'));
    fireEvent.change(screen.getByLabelText('流程输入'), { target: { value: '{"source":"ui"}' } });

    expect(validatePageSchemaValue(latestSchema).ok).toBe(true);
    expect(latestSchema.components['button-1'].events?.onClick).toEqual([
      { type: 'runFlow', flow: 'submitOrder', input: { source: 'ui' } },
    ]);

    unmount();
    render(
      <StatefulPanel
        initialSchema={latestSchema}
        selectedId="button-1"
        onSchemaChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByText('配置'));
    expect((screen.getByLabelText('流程输入') as HTMLInputElement).value).toBe('{"source":"ui"}');
  });
});
