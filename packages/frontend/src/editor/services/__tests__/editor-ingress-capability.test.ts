import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import * as contract from '@lowcode-platform/schema-contract';
import type { PageSchema } from '../../../types';
import { parseAndValidateFullSchema } from '../pageLogicAuthoring';
import { serializePageSchema } from '../schemaSync';
import { useSchemaHistoryStore } from '../../hooks/useSchemaHistoryStore';
import { PreviewPane } from '../../components/layout/PreviewPane/PreviewPane';

let registeredSaveCommand: (() => void) | null = null;

vi.mock('@monaco-editor/react', () => {
  return {
    default: ({ value, onChange, onMount }: any) => {
      React.useEffect(() => {
        if (onMount) {
          const fakeEditor = {
            addCommand: (_keybinding: number, handler: () => void) => {
              registeredSaveCommand = handler;
            },
            deltaDecorations: vi.fn().mockReturnValue([]),
            onDidFocusEditorText: vi.fn().mockReturnValue({ dispose: vi.fn() }),
            revealLineInCenter: vi.fn(),
            getModel: vi.fn(),
          };
          const fakeMonaco = {
            KeyMod: { CtrlCmd: 2048 },
            KeyCode: { KeyS: 49 },
            Range: class {},
          };
          onMount(fakeEditor, fakeMonaco);
        }
      }, [onMount]);

      return React.createElement('textarea', {
        'data-testid': 'monaco-editor-textarea',
        value,
        onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => onChange?.(e.target.value),
        onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            registeredSaveCommand?.();
          }
        },
      });
    },
  };
});

vi.mock('../../components/layout/PreviewPane/SelectableCanvas', () => ({
  SelectableCanvas: () => React.createElement('div', { 'data-testid': 'mock-selectable-canvas' }),
}));

const fixtureRaw = readFileSync(
  path.resolve(__dirname, '../../../../../../test-fixtures/m1a-page-logic-conformance.json'),
  'utf8',
);
const conformanceFixture = JSON.parse(fixtureRaw);

const manifestModulePath = path.resolve(
  __dirname,
  '../../../../../schema-contract/dist/capabilities/manifest.js',
);
const manifestModule = require(manifestModulePath);

const whitelist = ['Page', 'Text', 'Button'];

function withBlockedCapability<T>(
  capability: 'page-state' | 'named-computed' | 'action-flow',
  surface: 'contract' | 'validator' | 'editor-agent' | 'renderer' | 'compiler' | 'storage',
  fn: () => T,
): T {
  const original = manifestModule.getTrustedCapabilityManifest;
  manifestModule.getTrustedCapabilityManifest = () => ({
    manifestVersion: 1,
    matrix: contract.createTestCapabilityMatrix({
      [capability]: { [surface]: { status: 'unsupported', revision: 1 } },
    }),
  });
  try {
    return fn();
  } finally {
    manifestModule.getTrustedCapabilityManifest = original;
  }
}

describe('Editor JSON & Ingress Capability Gates (C3b / Issue #47)', () => {
  beforeEach(() => {
    registeredSaveCommand = null;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    registeredSaveCommand = null;
    vi.restoreAllMocks();
  });

  describe('6. Editor JSON → 保存 / 预览', () => {
    it('rejects blocked schema via real parseAndValidateFullSchema path and prevents schema update and save', () => {
      const serializedJson = serializePageSchema(conformanceFixture.schema);
      const onSchemaCommitSpy = vi.fn();
      const onSchemaChangeSpy = vi.fn();

      // 1. 验证底层契约校验函数准确输出 CAPABILITY_UNSUPPORTED
      withBlockedCapability('page-state', 'editor-agent', () => {
        const validationResult = parseAndValidateFullSchema(serializedJson, whitelist);
        expect(validationResult.success).toBe(false);
        if (validationResult.success) return;

        expect(validationResult.issues).toBeDefined();
        expect(validationResult.issues.length).toBeGreaterThan(0);
        expect(validationResult.issues[0].code).toBe('CAPABILITY_UNSUPPORTED');
        expect(validationResult.issues[0].path).toEqual(['logic', 'states']);
        expect(validationResult.issues[0].message).toContain('editor-agent');
      });

      // 2. 挂载真实生产 PreviewPane 组件，接入实际快捷键与保存处理链路
      const allComponents = {
        Page: (() => null) as any,
        Text: (() => null) as any,
        Button: (() => null) as any,
      };

      const { unmount } = render(
        React.createElement(PreviewPane, {
          schema: conformanceFixture.legacySchema,
          preset: { components: {} } as any,
          pageId: 'page-1',
          documentSessionId: 'session-1',
          allComponents,
          eventContext: {},
          previewTheme: 'light',
          onSchemaCommit: onSchemaCommitSpy,
          onSchemaChange: onSchemaChangeSpy,
        }),
      );

      try {
        // 切换到 'JSON' tab
        const jsonTabBtn = screen.getByRole('button', { name: 'JSON' });
        fireEvent.click(jsonTabBtn);

        const textarea = screen.getByTestId('monaco-editor-textarea') as HTMLTextAreaElement;

        // 模拟用户在 JSON 编辑器中输入了包含 page-state 能力的 schema
        fireEvent.change(textarea, {
          target: { value: serializedJson },
        });

        // 在能力被阻断时触发真实 Ctrl+S 保存处理路径
        withBlockedCapability('page-state', 'editor-agent', () => {
          fireEvent.keyDown(textarea, { key: 's', ctrlKey: true });

          // 严格副作用断言：真实 PreviewPane 处理路径因能力校验失败，绝不触发 onSchemaCommit 或 onSchemaChange
          expect(onSchemaCommitSpy).not.toHaveBeenCalled();
          expect(onSchemaChangeSpy).not.toHaveBeenCalled();

          // 真实 PreviewPane 应展示错误面板并提示能力不支持
          const errorPanel = screen.getByTestId('schema-error-panel');
          expect(errorPanel).toBeDefined();
          expect(errorPanel.textContent).toContain('CAPABILITY_UNSUPPORTED');
          expect(errorPanel.textContent).toContain('logic.states');
        });

        // 在能力正常支持时触发相同保存路径，确认能正常提交到 onSchemaCommit
        fireEvent.keyDown(textarea, { key: 's', ctrlKey: true });
        expect(onSchemaCommitSpy).toHaveBeenCalledTimes(1);
        const committed = onSchemaCommitSpy.mock.calls[0][0];
        expect(committed.logic?.states).toBeDefined();
      } finally {
        unmount();
      }
    });

    it('round-trips full conformance schema across JSON serialization without losing any capability fields', () => {
      const canonicalSchema = contract.requireSupportedPageSchema(conformanceFixture.schema);
      const serialized = serializePageSchema(canonicalSchema);
      const parsed = parseAndValidateFullSchema(serialized, whitelist);

      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      // 验证三个能力字段均完整保留，无一丢失
      expect(parsed.data.logic?.states).toEqual(canonicalSchema.logic?.states);
      expect(parsed.data.logic?.computed).toEqual(canonicalSchema.logic?.computed);
      expect(parsed.data.logic?.flows).toEqual(canonicalSchema.logic?.flows);
      expect(parsed.data).toEqual(canonicalSchema);
      expect(Object.isFrozen(parsed.data)).toBe(true);
    });

    it('preserves all three capabilities across history store undo and redo cycles', () => {
      const schemaA = contract.requireSupportedPageSchema(conformanceFixture.schema);
      const schemaB: PageSchema = {
        ...schemaA,
        components: {
          ...schemaA.components,
          'change-price': {
            ...schemaA.components['change-price'],
            props: {
              ...schemaA.components['change-price'].props,
              children: 'Revised price button',
            },
          },
        },
      };

      let currentSchema = schemaA;
      const handleSchemaUpdate = (next: PageSchema) => {
        currentSchema = next;
      };

      const { result } = renderHook(() =>
        useSchemaHistoryStore(schemaA, handleSchemaUpdate, {
          enableMerge: false,
        }),
      );

      // 更新到 schemaB
      act(() => {
        result.current.forceUpdateSchema(schemaB, 'Update Button');
      });
      expect(currentSchema.components['change-price'].props?.children).toBe('Revised price button');
      expect(currentSchema.logic?.states).toBeDefined();
      expect(currentSchema.logic?.computed).toBeDefined();
      expect(currentSchema.logic?.flows).toBeDefined();

      // Undo 到 schemaA
      act(() => {
        result.current.undo();
      });
      expect(currentSchema.components['change-price'].props?.children).toBe('change price');
      expect(currentSchema.logic?.states).toEqual(schemaA.logic?.states);
      expect(currentSchema.logic?.computed).toEqual(schemaA.logic?.computed);
      expect(currentSchema.logic?.flows).toEqual(schemaA.logic?.flows);

      // Redo 回到 schemaB
      act(() => {
        result.current.redo();
      });
      expect(currentSchema.components['change-price'].props?.children).toBe('Revised price button');
      expect(currentSchema.logic?.states).toEqual(schemaB.logic?.states);
      expect(currentSchema.logic?.computed).toEqual(schemaB.logic?.computed);
      expect(currentSchema.logic?.flows).toEqual(schemaB.logic?.flows);
    });

    it('round-trips legacy schema without logic and ensures no logic object is introduced', () => {
      const legacySchema = contract.requireSupportedPageSchema(conformanceFixture.legacySchema);
      const serialized = serializePageSchema(legacySchema);
      const parsed = parseAndValidateFullSchema(serialized, whitelist);

      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      expect(parsed.data).toEqual(legacySchema);
      expect(parsed.data.logic).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(parsed.data, 'logic')).toBe(false);
    });
  });
});
