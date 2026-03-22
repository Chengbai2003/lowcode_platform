import { ContextAssemblerService, FocusContextResult } from '../schema-context';
import { AgentIntentClassifierService } from './agent-intent-classifier.service';
import { AgentRoutingService } from './agent-routing.service';
import { AgentPolicyService } from './agent-policy.service';
import { AgentIntentClassification } from './types/agent-edit.types';

describe('AgentRoutingService', () => {
  function createService(options?: {
    prefetchedFocusContext?: FocusContextResult;
    classification?: AgentIntentClassification;
  }) {
    const contextAssembler: jest.Mocked<Pick<ContextAssemblerService, 'assemble'>> = {
      assemble: jest.fn().mockResolvedValue(
        options?.prefetchedFocusContext ?? {
          mode: 'candidates',
          schema: {
            rootId: 'root',
            components: {
              root: { id: 'root', type: 'Page' },
            },
          } as any,
          componentList: ['Page', 'Button'],
          candidates: [],
        },
      ),
    };
    const policyService: jest.Mocked<Pick<AgentPolicyService, 'createTraceId'>> = {
      createTraceId: jest
        .fn()
        .mockImplementation((requestId?: string) => requestId ?? 'agent-trace'),
    };
    const intentClassifier: jest.Mocked<Pick<AgentIntentClassifierService, 'classify'>> = {
      classify: jest.fn().mockResolvedValue(options?.classification),
    };

    return {
      service: new AgentRoutingService(
        contextAssembler as unknown as ContextAssemblerService,
        intentClassifier as unknown as AgentIntentClassifierService,
        policyService as unknown as AgentPolicyService,
      ),
      contextAssembler,
      intentClassifier,
      policyService,
    };
  }

  it('resolves explicit schema mode as manual override', async () => {
    const { service, contextAssembler } = createService();
    const decision = await service.resolve(
      {
        instruction: '生成一个登录页',
        responseMode: 'schema',
      },
      'agent-trace',
    );

    expect(decision.route).toEqual({
      requestedMode: 'schema',
      resolvedMode: 'schema',
      reason: 'manual_schema',
      manualOverride: true,
    });
    expect(contextAssembler.assemble).not.toHaveBeenCalled();
  });

  it('routes auto mode to schema when page context is missing', async () => {
    const { service, intentClassifier } = createService({
      classification: {
        mode: 'patch',
        confidence: 0.91,
        reason: '局部组件改动',
        needsPageContext: true,
        needsTargetResolution: true,
      },
    });
    const decision = await service.resolve(
      {
        instruction: '把这个按钮改成提交',
        responseMode: 'auto',
      },
      'agent-trace',
    );

    expect(decision.route.resolvedMode).toBe('schema');
    expect(decision.route.reason).toBe('missing_page_context');
    expect(intentClassifier.classify).toHaveBeenCalled();
  });

  it('routes general questions to answer mode', async () => {
    const { service, contextAssembler } = createService();
    const decision = await service.resolve(
      {
        instruction: '你是谁？',
        responseMode: 'auto',
      },
      'agent-trace',
    );

    expect(decision.route).toMatchObject({
      requestedMode: 'auto',
      resolvedMode: 'answer',
      reason: 'general_question_intent',
    });
    expect(contextAssembler.assemble).not.toHaveBeenCalled();
  });

  it('routes page understanding questions to answer mode', async () => {
    const focused: FocusContextResult = {
      mode: 'focused',
      schema: {
        rootId: 'root',
        components: {
          root: { id: 'root', type: 'Page' },
          button: { id: 'button', type: 'Button' },
        },
      } as any,
      componentList: ['Page', 'Button'],
      context: {
        focusNode: { id: 'button', type: 'Button' },
        parent: { id: 'root', type: 'Page' },
        ancestors: [],
        children: [],
        siblings: [],
        subtree: {},
        schemaStats: { totalComponents: 2, maxDepth: 1, rootId: 'root' },
        estimatedTokens: 10,
      },
    };
    const { service } = createService({
      prefetchedFocusContext: focused,
    });
    const decision = await service.resolve(
      {
        instruction: '这个按钮为什么禁用？',
        pageId: 'page-1',
        version: 3,
        selectedId: 'button',
        responseMode: 'auto',
      },
      'agent-trace',
    );

    expect(decision.route).toMatchObject({
      requestedMode: 'auto',
      resolvedMode: 'answer',
      reason: 'page_question_intent',
    });
    expect(decision.prefetchedFocusContext).toEqual(focused);
  });

  it('routes whole-page generation intent to schema in auto mode', async () => {
    const { service, contextAssembler } = createService();
    const decision = await service.resolve(
      {
        instruction: '生成一个登录页',
        pageId: 'page-1',
        version: 3,
        responseMode: 'auto',
      },
      'agent-trace',
    );

    expect(decision.route.resolvedMode).toBe('schema');
    expect(decision.route.reason).toBe('whole_page_generation_intent');
    expect(contextAssembler.assemble).not.toHaveBeenCalled();
  });

  it('routes auto mode to patch when selectedId is present', async () => {
    const focused: FocusContextResult = {
      mode: 'focused',
      schema: {
        rootId: 'root',
        components: {
          root: { id: 'root', type: 'Page' },
          button: { id: 'button', type: 'Button' },
        },
      } as any,
      componentList: ['Page', 'Button'],
      context: {
        focusNode: { id: 'button', type: 'Button' },
        parent: { id: 'root', type: 'Page' },
        ancestors: [],
        children: [],
        siblings: [],
        subtree: {},
        schemaStats: { totalComponents: 2, maxDepth: 1, rootId: 'root' },
        estimatedTokens: 10,
      },
    };
    const { service } = createService({
      prefetchedFocusContext: focused,
    });
    const decision = await service.resolve(
      {
        instruction: '把这个按钮改成提交',
        pageId: 'page-1',
        version: 3,
        selectedId: 'button',
        responseMode: 'auto',
      },
      'agent-trace',
    );

    expect(decision.route.resolvedMode).toBe('patch');
    expect(decision.route.reason).toBe('selected_target');
    expect(decision.prefetchedFocusContext).toEqual(focused);
  });

  it('routes auto mode to patch when candidates are found', async () => {
    const { service } = createService({
      prefetchedFocusContext: {
        mode: 'candidates',
        schema: {
          rootId: 'root',
          components: {
            root: { id: 'root', type: 'Page' },
            button: { id: 'button', type: 'Button' },
          },
        } as any,
        componentList: ['Page', 'Button'],
        candidates: [
          { id: 'button', type: 'Button', score: 0.8, reason: '文本匹配', matchType: 'keyword' },
        ],
      },
    });
    const decision = await service.resolve(
      {
        instruction: '把按钮改成提交',
        pageId: 'page-1',
        version: 3,
        responseMode: 'auto',
      },
      'agent-trace',
    );

    expect(decision.route.resolvedMode).toBe('patch');
    expect(decision.route.reason).toBe('candidate_target');
    expect(decision.route.manualOverride).toBe(false);
  });

  it('prioritizes llm answer classification before rule heuristics', async () => {
    const focused: FocusContextResult = {
      mode: 'focused',
      schema: {
        rootId: 'root',
        components: {
          root: { id: 'root', type: 'Page' },
          button: { id: 'button', type: 'Button' },
        },
      } as any,
      componentList: ['Page', 'Button'],
      context: {
        focusNode: { id: 'button', type: 'Button' },
        parent: { id: 'root', type: 'Page' },
        ancestors: [],
        children: [],
        siblings: [],
        subtree: {},
        schemaStats: { totalComponents: 2, maxDepth: 1, rootId: 'root' },
        estimatedTokens: 10,
      },
    };
    const { service, contextAssembler } = createService({
      prefetchedFocusContext: focused,
      classification: {
        mode: 'answer',
        confidence: 0.88,
        reason: '页面理解问答',
        needsPageContext: true,
        needsTargetResolution: false,
      },
    });

    const decision = await service.resolve(
      {
        instruction: '这个按钮为什么禁用？',
        pageId: 'page-1',
        version: 3,
        selectedId: 'button',
        responseMode: 'auto',
      },
      'agent-trace',
    );

    expect(decision.route).toMatchObject({
      requestedMode: 'auto',
      resolvedMode: 'answer',
      reason: 'llm_intent_answer',
    });
    expect(decision.prefetchedFocusContext).toEqual(focused);
    expect(contextAssembler.assemble).toHaveBeenCalledTimes(1);
  });

  it('prioritizes llm patch classification when auto mode has page context', async () => {
    const focused: FocusContextResult = {
      mode: 'focused',
      schema: {
        rootId: 'root',
        components: {
          root: { id: 'root', type: 'Page' },
          button: { id: 'button', type: 'Button' },
        },
      } as any,
      componentList: ['Page', 'Button'],
      context: {
        focusNode: { id: 'button', type: 'Button' },
        parent: { id: 'root', type: 'Page' },
        ancestors: [],
        children: [],
        siblings: [],
        subtree: {},
        schemaStats: { totalComponents: 2, maxDepth: 1, rootId: 'root' },
        estimatedTokens: 10,
      },
    };
    const { service } = createService({
      prefetchedFocusContext: focused,
      classification: {
        mode: 'patch',
        confidence: 0.93,
        reason: '局部组件改动',
        needsPageContext: true,
        needsTargetResolution: true,
      },
    });

    const decision = await service.resolve(
      {
        instruction: '把这个按钮改成提交',
        pageId: 'page-1',
        version: 3,
        responseMode: 'auto',
      },
      'agent-trace',
    );

    expect(decision.route).toMatchObject({
      requestedMode: 'auto',
      resolvedMode: 'patch',
      reason: 'llm_intent_patch',
    });
    expect(decision.prefetchedFocusContext).toEqual(focused);
  });

  it('falls back to rules when llm confidence is low', async () => {
    const { service } = createService({
      prefetchedFocusContext: {
        mode: 'candidates',
        schema: {
          rootId: 'root',
          components: {
            root: { id: 'root', type: 'Page' },
            button: { id: 'button', type: 'Button' },
          },
        } as any,
        componentList: ['Page', 'Button'],
        candidates: [
          { id: 'button', type: 'Button', score: 0.8, reason: '文本匹配', matchType: 'keyword' },
        ],
      },
      classification: {
        mode: 'answer',
        confidence: 0.51,
        reason: '低置信分类',
        needsPageContext: true,
        needsTargetResolution: false,
      },
    });

    const decision = await service.resolve(
      {
        instruction: '把按钮改成提交',
        pageId: 'page-1',
        version: 3,
        responseMode: 'auto',
      },
      'agent-trace',
    );

    expect(decision.route).toMatchObject({
      requestedMode: 'auto',
      resolvedMode: 'patch',
      reason: 'candidate_target',
      classifierSource: 'llm_with_rule_fallback',
      fallbackApplied: true,
      confidence: 0.51,
    });
  });
});
