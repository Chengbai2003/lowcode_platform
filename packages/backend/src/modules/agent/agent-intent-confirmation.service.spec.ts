import { AgentIntentConfirmationService } from './agent-intent-confirmation.service';

describe('AgentIntentConfirmationService', () => {
  it('keeps multiple pending confirmations for the same session', () => {
    const service = new AgentIntentConfirmationService();

    const firstPending = service.create({
      sessionId: 'session-1',
      instruction: '把所有字段的 label 宽度改成 200',
      pageId: 'page-1',
      rootId: 'form',
      traceId: 'trace-1',
      options: [
        {
          semanticKey: 'form_item',
          targetType: 'FormItem',
          label: '表单项',
          description: '统一修改表单项容器。',
        },
      ],
    });
    const secondPending = service.create({
      sessionId: 'session-1',
      instruction: '把所有字段的 placeholder 改成统一文案',
      pageId: 'page-1',
      rootId: 'form',
      traceId: 'trace-2',
      options: [
        {
          semanticKey: 'input',
          targetType: 'Input',
          label: '输入框',
          description: '统一修改输入控件本身。',
        },
      ],
    });

    const firstResolved = service.getConfirmedOption('session-1', firstPending.options[0].intentId);
    const secondResolved = service.getConfirmedOption('session-1', secondPending.options[0].intentId);

    expect(firstResolved?.pending.intentConfirmationId).toBe(firstPending.intentConfirmationId);
    expect(secondResolved?.pending.intentConfirmationId).toBe(secondPending.intentConfirmationId);

    service.clear('session-1', firstPending.intentConfirmationId);

    expect(service.getConfirmedOption('session-1', firstPending.options[0].intentId)).toBeUndefined();
    expect(
      service.getConfirmedOption('session-1', secondPending.options[0].intentId)?.pending
        .intentConfirmationId,
    ).toBe(secondPending.intentConfirmationId);
  });
});
