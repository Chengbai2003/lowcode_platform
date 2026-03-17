import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PropertyPanel } from './PropertyPanel';
import type { A2UISchema } from '../../../types';

function createSchema(id: string, type: string, props: Record<string, unknown> = {}): A2UISchema {
  return {
    rootId: id,
    components: {
      [id]: {
        id,
        type,
        props,
        childrenIds: [],
      },
    },
  };
}

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
    <PropertyPanel
      schema={schema}
      selectedId={selectedId}
      onSchemaChange={(nextSchema) => {
        onSchemaChange(nextSchema);
        setSchema(nextSchema);
      }}
    />
  );
};

describe('PropertyPanel complex editors', () => {
  it('renders table columns editor and falls back from invalid value', () => {
    const onSchemaChange = vi.fn();
    const schema = createSchema('table-1', 'Table', { columns: 'invalid' });

    render(
      <StatefulPanel initialSchema={schema} selectedId="table-1" onSchemaChange={onSchemaChange} />,
    );

    expect(screen.getByDisplayValue('列1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '新增列' }));

    const latestSchema = onSchemaChange.mock.lastCall?.[0] as A2UISchema;
    const columns = latestSchema.components['table-1']?.props?.columns as Array<unknown>;
    expect(columns).toHaveLength(2);
  });

  it('supports switching table column kinds and editing action buttons', () => {
    const onSchemaChange = vi.fn();
    const schema = createSchema('table-1', 'Table', {
      columns: [{ title: '名称', dataIndex: 'name', key: 'name' }],
    });

    render(
      <StatefulPanel initialSchema={schema} selectedId="table-1" onSchemaChange={onSchemaChange} />,
    );

    fireEvent.change(screen.getByLabelText('列1类型'), {
      target: { value: 'action' },
    });

    expect(screen.getByText('按钮 1')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('列1按钮1文本'), {
      target: { value: '查看' },
    });
    fireEvent.change(screen.getByLabelText('列1按钮1类型'), {
      target: { value: 'link' },
    });
    fireEvent.click(screen.getByLabelText('列1按钮1危险样式'));

    const latestSchema = onSchemaChange.mock.lastCall?.[0] as A2UISchema;
    const columns = latestSchema.components['table-1']?.props?.columns as Array<
      Record<string, unknown>
    >;

    expect(columns[0]).toMatchObject({
      kind: 'action',
      buttons: [
        {
          label: '查看',
          buttonType: 'link',
          danger: true,
        },
      ],
    });
  });

  it('supports visual edit for form rules', () => {
    const onSchemaChange = vi.fn();
    const schema = createSchema('form-item-1', 'FormItem', { rules: 'invalid' });

    render(
      <StatefulPanel
        initialSchema={schema}
        selectedId="form-item-1"
        onSchemaChange={onSchemaChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '新增规则' }));
    fireEvent.click(screen.getByLabelText('规则1必填'));
    fireEvent.change(screen.getByLabelText('规则1提示'), {
      target: { value: '请输入用户名' },
    });
    fireEvent.change(screen.getByLabelText('规则1类型'), {
      target: { value: 'string' },
    });
    fireEvent.change(screen.getByLabelText('规则1触发'), {
      target: { value: 'onBlur' },
    });

    const latestSchema = onSchemaChange.mock.lastCall?.[0] as A2UISchema;
    const rules = latestSchema.components['form-item-1']?.props?.rules as Array<
      Record<string, unknown>
    >;
    expect(rules).toEqual([
      {
        required: true,
        message: '请输入用户名',
        type: 'string',
        trigger: 'onBlur',
      },
    ]);
  });

  it('renders visible properties conditionally', () => {
    const schemaVertical = createSchema('divider-1', 'Divider', {
      type: 'vertical',
    });
    const onSchemaChange = vi.fn();

    render(
      <StatefulPanel
        initialSchema={schemaVertical}
        selectedId="divider-1"
        onSchemaChange={onSchemaChange}
      />,
    );

    expect(screen.queryByText('标题位置')).not.toBeInTheDocument();
    cleanup();

    const schemaHorizontal = createSchema('divider-1', 'Divider', {
      type: 'horizontal',
    });

    render(
      <StatefulPanel
        initialSchema={schemaHorizontal}
        selectedId="divider-1"
        onSchemaChange={onSchemaChange}
      />,
    );

    expect(screen.getByText('标题位置')).toBeInTheDocument();
  });

  it('supports slot editor and normalizes invalid slot value', () => {
    const onSchemaChange = vi.fn();
    const schema = createSchema('button-1', 'Button', {
      children: { invalid: true },
    });

    render(
      <StatefulPanel
        initialSchema={schema}
        selectedId="button-1"
        onSchemaChange={onSchemaChange}
      />,
    );

    expect(screen.getByDisplayValue('按钮')).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText('输入默认插槽内容（组件树子节点会附加在后）');
    fireEvent.change(textarea, { target: { value: '立即提交' } });

    const latestSchema = onSchemaChange.mock.lastCall?.[0] as A2UISchema;
    expect(latestSchema.components['button-1']?.props?.children).toBe('立即提交');
  });

  it('shows conflict hint when slot text and childrenIds both exist', () => {
    const onSchemaChange = vi.fn();
    const schema: A2UISchema = {
      rootId: 'button-1',
      components: {
        'button-1': {
          id: 'button-1',
          type: 'Button',
          props: {
            children: '按钮文本',
          },
          childrenIds: ['icon-1'],
        },
        'icon-1': {
          id: 'icon-1',
          type: 'Div',
          props: {},
          childrenIds: [],
        },
      },
    };

    render(
      <StatefulPanel
        initialSchema={schema}
        selectedId="button-1"
        onSchemaChange={onSchemaChange}
      />,
    );

    expect(screen.getByText('插槽内容与子组件同时存在')).toBeInTheDocument();
  });
});
