import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EvalCase } from './eval-case.types';
import { replayPatchThroughAgent } from './pipeline';

describe('Agent production replay', () => {
  it('executes a fixture tool call through AgentRunner and previews the resulting schema', async () => {
    const evalCase = JSON.parse(
      readFileSync(join(__dirname, 'cases/patch-insert-component.case.json'), 'utf-8'),
    ) as EvalCase;

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
});
