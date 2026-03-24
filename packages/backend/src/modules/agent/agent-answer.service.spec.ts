import { AIService } from '../ai/ai.service';
import { ContextAssemblerService } from '../schema-context';
import { AgentAnswerService } from './agent-answer.service';
import { AgentProgressReporter } from './types/agent-progress.types';

describe('AgentAnswerService', () => {
  function createReporter(): jest.Mocked<AgentProgressReporter> {
    return {
      emitMeta: jest.fn(),
      emitRoute: jest.fn(),
      emitStatus: jest.fn(),
      emitContentDelta: jest.fn(),
      emitResult: jest.fn(),
      emitError: jest.fn(),
      emitDone: jest.fn(),
    };
  }

  it('streams answer deltas through the reporter when stream mode is enabled', async () => {
    const aiService: jest.Mocked<Pick<AIService, 'chat' | 'streamChatText'>> = {
      chat: jest.fn(),
      streamChatText: jest.fn().mockImplementation(async (_request, options) => {
        await options?.onTextDelta?.('这是一个');
        await options?.onTextDelta?.('流式回答。');
        return {
          content: '这是一个流式回答。',
          usage: {
            promptTokens: 3,
            completionTokens: 4,
            totalTokens: 7,
          },
          finishReason: 'stop',
        };
      }),
    };
    const contextAssembler: jest.Mocked<Pick<ContextAssemblerService, 'assemble'>> = {
      assemble: jest.fn(),
    };
    const reporter = createReporter();

    const service = new AgentAnswerService(
      aiService as unknown as AIService,
      contextAssembler as unknown as ContextAssemblerService,
    );

    const result = await service.answer(
      {
        instruction: '介绍一下这个页面',
        stream: true,
      },
      'agent-answer-stream',
      {
        reporter,
      },
    );

    expect(aiService.streamChatText).toHaveBeenCalledTimes(1);
    expect(reporter.emitContentDelta).toHaveBeenNthCalledWith(1, {
      mode: 'answer',
      delta: '这是一个',
    });
    expect(reporter.emitContentDelta).toHaveBeenNthCalledWith(2, {
      mode: 'answer',
      delta: '流式回答。',
    });
    expect(result).toMatchObject({
      mode: 'answer',
      content: '这是一个流式回答。',
      traceId: 'agent-answer-stream',
    });
  });
});
