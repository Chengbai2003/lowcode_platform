import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AIMessage } from './AIAssistant.types';
import { AIAssistantMessageList } from './AIAssistantMessageList';

describe('AIAssistantMessageList', () => {
  it('renders intent confirmation choices with the trace summary panel in the same assistant card', () => {
    const onConfirmIntent = vi.fn().mockResolvedValue(undefined);

    const messages: AIMessage[] = [
      {
        id: 'msg-intent',
        type: 'ai',
        content: '请先确认你说的是哪一类组件。',
        timestamp: new Date('2026-03-23T12:00:00.000Z'),
        status: 'success',
        traceId: 'agent-trace-intent',
        route: {
          requestedMode: 'auto',
          resolvedMode: 'patch',
          reason: 'selected_target',
          manualOverride: false,
        },
        progress: {
          stage: 'awaiting_intent_confirmation',
          label: '已识别到多种可能语义，等待确认',
          traceId: 'agent-trace-intent',
        },
        traceSummary: {
          stages: [
            {
              stage: 'planning_scope',
              label: '正在根据已确认语义解析批量范围',
              traceId: 'agent-trace-intent',
            },
            {
              stage: 'awaiting_intent_confirmation',
              label: '已识别到多种可能语义，等待确认',
              traceId: 'agent-trace-intent',
            },
          ],
          toolCalls: [
            {
              toolName: 'resolve_collection_scope',
              label: 'resolve_collection_scope',
              success: true,
            },
          ],
          finishReason: 'stop',
          errorCode: 'PAGE_VERSION_CONFLICT',
        },
        intentConfirmation: {
          intentConfirmationId: 'intent-confirmation-1',
          instruction: '把所有字段的 label 宽度改成 200',
          question: '请先确认你说的是哪一类组件',
          options: [
            {
              intentId: 'intent-1',
              label: '表单项',
              description: '统一修改表单项容器。',
            },
            {
              intentId: 'intent-2',
              label: '输入框',
              description: '统一修改输入控件本身。',
            },
          ],
          warnings: ['此阶段不会触发画布高亮'],
        },
      },
    ];

    render(
      <AIAssistantMessageList
        messages={messages}
        onApplySchema={vi.fn()}
        onApplyPatchPreview={vi.fn().mockResolvedValue(false)}
        onResolveClarification={vi.fn().mockResolvedValue(undefined)}
        onConfirmIntent={onConfirmIntent}
        onConfirmScope={vi.fn().mockResolvedValue(undefined)}
        onCancelScopeHighlight={vi.fn()}
        onRestoreScopeHighlight={vi.fn()}
        activeScopeSourceMessageId={null}
        busy={false}
        endRef={React.createRef<HTMLDivElement>()}
      />,
    );

    expect(screen.getByText('语义确认')).toBeInTheDocument();
    expect(screen.getByText('阶段时间线')).toBeInTheDocument();
    expect(screen.getAllByText('已识别到多种可能语义，等待确认')).toHaveLength(2);
    expect(screen.getByText('最近工具')).toBeInTheDocument();
    expect(screen.getByText('resolve_collection_scope')).toBeInTheDocument();
    expect(screen.getByText('PAGE_VERSION_CONFLICT')).toBeInTheDocument();
    expect(screen.getByText('stop')).toBeInTheDocument();
    expect(screen.queryByText('确认范围并生成预览')).not.toBeInTheDocument();
    expect(screen.queryByText('重新高亮范围')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /表单项/ }));

    expect(onConfirmIntent).toHaveBeenCalledWith('msg-intent', 'intent-1');
  });
});
