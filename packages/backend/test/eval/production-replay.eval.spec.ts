import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AIService } from '../../src/modules/ai/ai.service';
import type { EditorPatchOperation } from '../../src/modules/agent-tools/types/editor-patch.types';
import type { EvalCase } from './eval-case.types';
import { FixtureAIService, replayPatchThroughAgent } from './pipeline';

function loadCase(name: string): EvalCase {
  return JSON.parse(readFileSync(join(__dirname, `cases/${name}.case.json`), 'utf-8')) as EvalCase;
}

function makeFixtureInput(
  overrides: Partial<Parameters<AIService['runToolCalling']>[0]> = {},
): Parameters<AIService['runToolCalling']>[0] {
  return {
    system: 'fixture system',
    prompt: 'fixture prompt',
    timeoutMs: 1_000,
    maxSteps: 4,
    maxToolCalls: 4,
    toolDefinitions: [
      {
        name: 'update_component_props',
        description: 'Update component props',
        inputSchema: { type: 'object' },
        visibility: 'agent',
        execute: jest.fn(),
      },
    ],
    executeTool: jest.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

describe('Agent production replay', () => {
  it('executes a fixture tool call through AgentRunner and previews the resulting schema', async () => {
    const evalCase = loadCase('patch-insert-component');

    const replay = await replayPatchThroughAgent(evalCase);

    expect(replay.fixtureToolNames).toEqual(['insert_component']);
    expect(replay.response.mode).toBe('patch');
    if (replay.response.mode !== 'patch') {
      throw new Error(`Expected patch response, got ${replay.response.mode}`);
    }
    expect(replay.response.previewSchema.components.btn1).toMatchObject({
      id: 'btn1',
      type: 'Button',
      props: { children: '提交' },
    });
  });

  it('replays every recorded tool call before normalizing a no-op patch', async () => {
    const replay = await replayPatchThroughAgent(loadCase('patch-update-props-noop-dedup'));

    expect(replay.fixtureToolNames).toEqual(['update_component_props', 'update_component_props']);
    expect(replay.response.mode).toBe('patch');
    if (replay.response.mode !== 'patch') {
      throw new Error(`Expected patch response, got ${replay.response.mode}`);
    }
    expect(replay.response.patch).toHaveLength(1);
  });

  it('rejects fixture tool calls that exceed the supplied tool budget', async () => {
    const patch = loadCase('patch-update-props-noop-dedup').fixtures
      .patch as EditorPatchOperation[];
    const fixtureAI = new FixtureAIService(patch);

    await expect(
      fixtureAI.runToolCalling(makeFixtureInput({ maxToolCalls: 1 })),
    ).rejects.toMatchObject({
      name: 'AIToolCallingError',
      reason: 'policy',
      message: 'Tool call limit exceeded',
    });
  });

  it('stops fixture replay at the supplied step budget', async () => {
    const patch = loadCase('patch-update-props-noop-dedup').fixtures
      .patch as EditorPatchOperation[];
    const fixtureAI = new FixtureAIService(patch);

    const result = await fixtureAI.runToolCalling(makeFixtureInput({ maxSteps: 1 }));

    expect(fixtureAI.executedToolNames).toEqual(['update_component_props']);
    expect(result.steps).toHaveLength(1);
    expect(result.finishReason).toBe('tool_calls');
  });

  it('rejects fixture tools outside the supplied definitions', async () => {
    const patch = loadCase('patch-insert-component').fixtures.patch as EditorPatchOperation[];
    const fixtureAI = new FixtureAIService(patch);

    await expect(fixtureAI.runToolCalling(makeFixtureInput())).rejects.toMatchObject({
      name: 'AIToolCallingError',
      reason: 'policy',
    });
  });

  it('reports a failed fixture tool call before propagating the error', async () => {
    const patch = loadCase('patch-update-props-noop-dedup').fixtures
      .patch as EditorPatchOperation[];
    const fixtureAI = new FixtureAIService(patch);
    const onToolCallFinish = jest.fn();

    await expect(
      fixtureAI.runToolCalling(
        makeFixtureInput({
          executeTool: jest.fn().mockRejectedValue(new Error('fixture tool failed')),
          onToolCallFinish,
        }),
      ),
    ).rejects.toMatchObject({
      name: 'AIToolCallingError',
      reason: 'policy',
      message: 'fixture tool failed',
    });
    expect(onToolCallFinish).toHaveBeenCalledWith({
      stepNumber: 0,
      toolCall: { toolName: 'update_component_props' },
      success: false,
    });
  });
});
