import { AIService } from '../ai/ai.service';
import { AgentIntentClassifierService } from './agent-intent-classifier.service';

describe('AgentIntentClassifierService', () => {
  function createService(mockContent: string) {
    const aiService: jest.Mocked<Pick<AIService, 'chat'>> = {
      chat: jest.fn().mockResolvedValue({
        content: mockContent,
        usage: {
          promptTokens: 1,
          completionTokens: 1,
          totalTokens: 2,
        },
        finishReason: 'stop',
      }),
    };

    return {
      service: new AgentIntentClassifierService(aiService as unknown as AIService),
      aiService,
    };
  }

  it('classifies local edit instructions as patch and forwards lightweight signals', async () => {
    const { service, aiService } = createService(`{
      "mode": "patch",
      "confidence": 0.94,
      "reason": "局部组件改动",
      "needsPageContext": true,
      "needsTargetResolution": true
    }`);

    const result = await service.classify(
      {
        instruction: '把这个按钮改成提交',
        pageId: 'page-1',
        version: 3,
        selectedId: 'button-1',
        draftSchema: {
          rootId: 'root',
          components: {
            root: { id: 'root', type: 'Page' },
          },
        },
      },
      'agent-trace',
    );

    expect(aiService.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('"hasSelectedId": true'),
          }),
        ]),
      }),
    );
    expect(result).toEqual({
      mode: 'patch',
      confidence: 0.94,
      reason: '局部组件改动',
      needsPageContext: true,
      needsTargetResolution: true,
    });
  });

  it('parses fenced json output and returns undefined for invalid payloads', async () => {
    const { service } = createService(
      '```json\n{"mode":"answer","confidence":0.81,"reason":"页面问答","needsPageContext":true,"needsTargetResolution":false}\n```',
    );

    await expect(
      service.classify(
        {
          instruction: '这个页面是做什么的？',
          pageId: 'page-1',
          version: 3,
        },
        'agent-trace',
      ),
    ).resolves.toEqual({
      mode: 'answer',
      confidence: 0.81,
      reason: '页面问答',
      needsPageContext: true,
      needsTargetResolution: false,
    });

    const invalidService = new AgentIntentClassifierService({
      chat: jest.fn().mockResolvedValue({
        content: 'not-json',
        usage: {
          promptTokens: 1,
          completionTokens: 1,
          totalTokens: 2,
        },
        finishReason: 'stop',
      }),
    } as unknown as AIService);

    await expect(
      invalidService.classify(
        {
          instruction: '生成一个登录页',
        },
        'agent-trace',
      ),
    ).resolves.toBeUndefined();
  });
});
