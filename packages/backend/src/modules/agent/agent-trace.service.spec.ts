import { AgentMetricsService } from './agent-metrics.service';
import { AgentReplayService } from './agent-replay.service';
import { AgentTraceService } from './agent-trace.service';

describe('AgentTraceService', () => {
  it('records trace, replay steps, and metrics summary', () => {
    const traceService = new AgentTraceService();
    const metricsService = new AgentMetricsService(traceService);
    const replayService = new AgentReplayService(traceService);

    traceService.startTrace('agent-trace-1', {
      instruction: '把所有字段的 label 宽度改成 200',
      sessionId: 'session-1',
      responseMode: 'patch',
    });
    traceService.recordStatus('agent-trace-1', {
      stage: 'awaiting_intent_confirmation',
      label: '需要先确认你的意思',
    });
    traceService.recordToolCall('agent-trace-1', {
      toolName: 'resolve_collection_scope',
      toolInput: { rootId: 'form', targetType: 'FormItem' },
      toolOutput: { status: 'matched', targetCount: 2 },
      success: true,
      durationMs: 12,
    });
    traceService.recordResult('agent-trace-1', {
      mode: 'scope_confirmation',
      content: '已识别批量范围',
      question: '确认修改当前容器下的 2 个表单项',
      scopeConfirmationId: 'scope-1',
      scope: {
        rootId: 'form',
        matchedType: 'FormItem',
        matchedDisplayName: '表单项',
        targetIds: ['form-item-a', 'form-item-b'],
        targetCount: 2,
      },
      warnings: [],
      traceId: 'agent-trace-1',
      route: {
        requestedMode: 'patch',
        resolvedMode: 'patch',
        reason: 'manual_patch',
        manualOverride: true,
      },
    });
    traceService.recordDone('agent-trace-1', true);

    const trace = traceService.getTrace('agent-trace-1');
    expect(trace?.toolCalls).toHaveLength(1);
    expect(trace?.statusEvents[0]?.stage).toBe('awaiting_intent_confirmation');
    expect(trace?.result).toEqual({
      mode: 'scope_confirmation',
      warningsCount: 0,
      resolvedSelectedId: undefined,
      requiresConfirmation: undefined,
    });

    const replay = replayService.getReplay('agent-trace-1');
    expect(replay?.replaySteps.some((step) => step.type === 'tool')).toBe(true);

    expect(metricsService.getSummary()).toEqual(
      expect.objectContaining({
        totalCount: 1,
        successCount: 0,
        confirmationBlockedCount: 1,
        averageToolCallCount: 1,
      }),
    );
  });

  it('prunes expired traces and keeps success failure version conflict metrics accurate', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-23T00:00:00.000Z'));

    const traceService = new AgentTraceService();
    const metricsService = new AgentMetricsService(traceService);

    traceService.startTrace('agent-expired', {
      instruction: '过期 trace',
      pageId: 'page-1',
      version: 3,
      responseMode: 'patch',
    });
    traceService.recordDone('agent-expired', true);

    jest.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);

    traceService.startTrace('agent-success', {
      instruction: '把按钮改成提交',
      pageId: 'page-1',
      version: 3,
      responseMode: 'patch',
    });
    traceService.recordResult('agent-success', {
      mode: 'patch',
      patch: [{ op: 'updateProps', componentId: 'button', props: { children: '提交' } }],
      previewSchema: {
        version: 3,
        rootId: 'root',
        components: {
          root: { id: 'root', type: 'Page', childrenIds: ['button'] },
          button: { id: 'button', type: 'Button', props: { children: '提交' } },
        },
      },
      previewSummary: '本次修改共 1 个 patch。',
      changeGroups: [],
      risk: {
        level: 'low',
        reasons: ['局部低范围修改'],
        patchOps: 1,
        distinctTargets: 1,
        requiresConfirmation: false,
      },
      requiresConfirmation: false,
      warnings: [],
      traceId: 'agent-success',
      route: {
        requestedMode: 'patch',
        resolvedMode: 'patch',
        reason: 'manual_patch',
        manualOverride: true,
      },
    });
    traceService.markVersionConflict('agent-success');
    traceService.recordDone('agent-success', true);

    traceService.startTrace('agent-failure', {
      instruction: '把所有按钮都隐藏',
      pageId: 'page-1',
      version: 3,
      responseMode: 'patch',
    });
    traceService.recordError('agent-failure', {
      code: 'AGENT_POLICY_BLOCKED',
      message: '批量修改必须先解析稳定的范围，请重新明确目标类型后再试',
      traceId: 'agent-failure',
    });
    traceService.recordDone('agent-failure', false);

    expect(traceService.getTrace('agent-expired')).toBeUndefined();
    expect(traceService.getTrace('agent-success')?.result).toEqual({
      mode: 'patch',
      warningsCount: 0,
      resolvedSelectedId: undefined,
      requiresConfirmation: false,
    });
    expect(metricsService.getSummary()).toEqual({
      totalCount: 2,
      successCount: 1,
      failureCount: 1,
      confirmationBlockedCount: 0,
      averageDurationMs: 0,
      averageToolCallCount: 0,
      versionConflictCount: 1,
    });

    jest.useRealTimers();
  });
});
