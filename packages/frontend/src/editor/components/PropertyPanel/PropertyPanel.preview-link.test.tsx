import React, { useEffect, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { A2UISchema } from '../../../types';
import { PropertyPanel } from './PropertyPanel';
import { LowcodeProvider, Renderer } from '@/renderer';

const createSchema = (): A2UISchema => ({
  rootId: 'root',
  components: {
    root: {
      id: 'root',
      type: 'Div',
      props: {
        id: 'root-node',
        className: 'initial-class',
        children: 'initial slot',
        style: { color: 'blue' },
      },
      childrenIds: [],
    },
  },
});

const flushMicrotasks = () => new Promise<void>((resolve) => queueMicrotask(() => resolve()));
const renderWithFlush = async (ui: React.ReactElement) => {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(ui);
    await flushMicrotasks();
  });
  return result!;
};

interface TestHarnessProps {
  initialSchema: A2UISchema;
  eventContext: Record<string, unknown>;
  onSchemaChange: (schema: A2UISchema) => void;
}

const TestHarness: React.FC<TestHarnessProps> = ({
  initialSchema,
  eventContext,
  onSchemaChange,
}) => {
  const [schema, setSchema] = useState<A2UISchema>(initialSchema);

  useEffect(() => {
    onSchemaChange(schema);
  }, [schema, onSchemaChange]);

  return (
    <div>
      <PropertyPanel schema={schema} selectedId="root" onSchemaChange={setSchema} />
      <LowcodeProvider>
        <Renderer schema={schema} eventContext={eventContext} onComponentClick={() => {}} />
      </LowcodeProvider>
    </div>
  );
};

describe('PropertyPanel -> preview linkage', () => {
  it('updates schema, preview, and remounts consistently for expression/slot/json', async () => {
    const eventContext = { appName: 'demo' };
    let latestSchema = createSchema();

    const { container, unmount } = await renderWithFlush(
      <TestHarness
        initialSchema={latestSchema}
        eventContext={eventContext}
        onSchemaChange={(schema) => {
          latestSchema = schema;
        }}
      />,
    );

    const classNameInput = screen.getByDisplayValue('initial-class');
    await act(async () => {
      fireEvent.change(classNameInput, { target: { value: '{{appName}}' } });
    });

    await waitFor(() => {
      const rootEl = container.querySelector('[data-component-id="root"]') as HTMLElement | null;
      expect(rootEl).not.toBeNull();
      expect(rootEl?.className).toContain('demo');
    });

    const slotTextarea = screen.getByDisplayValue('initial slot');
    await act(async () => {
      fireEvent.change(slotTextarea, { target: { value: 'updated slot' } });
    });

    await waitFor(() => {
      const rootEl = container.querySelector('[data-component-id="root"]') as HTMLElement | null;
      expect(rootEl?.textContent).toContain('updated slot');
    });

    const styleTextarea = screen
      .getAllByRole('textbox')
      .find((el) => (el as HTMLTextAreaElement).value.includes('"color"')) as
      | HTMLTextAreaElement
      | undefined;

    expect(styleTextarea).toBeDefined();

    await act(async () => {
      fireEvent.change(styleTextarea!, { target: { value: '{"color":"red"}' } });
      fireEvent.blur(styleTextarea!);
    });

    await waitFor(() => {
      const rootEl = container.querySelector('[data-component-id="root"]') as HTMLElement | null;
      expect(rootEl?.style.color).toBe('red');
    });

    await act(async () => {
      unmount();
      await flushMicrotasks();
    });

    await renderWithFlush(
      <TestHarness
        initialSchema={latestSchema}
        eventContext={eventContext}
        onSchemaChange={(schema) => {
          latestSchema = schema;
        }}
      />,
    );

    expect(screen.getByDisplayValue('{{appName}}')).toBeInTheDocument();
    expect(screen.getByDisplayValue('updated slot')).toBeInTheDocument();

    const remountStyleTextarea = screen
      .getAllByRole('textbox')
      .find((el) => (el as HTMLTextAreaElement).value.includes('"color"')) as
      | HTMLTextAreaElement
      | undefined;

    expect(remountStyleTextarea).toBeDefined();
    expect(remountStyleTextarea?.value).toContain('"color": "red"');
  });
});
