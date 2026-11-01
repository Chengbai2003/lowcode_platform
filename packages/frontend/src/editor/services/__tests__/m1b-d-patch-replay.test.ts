import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { PageSchema } from '@lowcode-platform/schema-contract';
import { applyPatchToSchema } from '../patchAdapter';
import type { EditorPatchOperation } from '../../types/patch';

/**
 * D2（M1b-1 PR D / 计划 §6.1）：真实 write 工具产出的 Patch（backend D1 链生成，
 * 非手写）经前端 applyPatchToSchema 重放，与服务端预览产物（expectedSchema，
 * PatchApplyService.applyPatch 于 D1 断言全等）完全相等。
 */

const fixture = JSON.parse(
  readFileSync(
    path.resolve(__dirname, '../../../../../../test-fixtures/m1b-d-editor-closure.json'),
    'utf8',
  ),
) as {
  baseSchema: PageSchema;
  patch: EditorPatchOperation[];
  expectedSchema: PageSchema;
};

describe('applyPatchToSchema replay parity (M1b-1 PR D / Refs #64) — D2', () => {
  it('真实工具 Patch 前端重放与服务端预览产物完全相等', () => {
    const replayed = applyPatchToSchema(
      JSON.parse(JSON.stringify(fixture.baseSchema)) as PageSchema,
      fixture.patch,
    );
    expect(JSON.parse(JSON.stringify(replayed))).toEqual(fixture.expectedSchema);
  });

  it('重放产物包含 dataSources 声明与 executeDataSource 动作（仅声明，无运行值）', () => {
    const replayed = applyPatchToSchema(
      JSON.parse(JSON.stringify(fixture.baseSchema)) as PageSchema,
      fixture.patch,
    );
    const logic = replayed.logic ?? {};
    expect(Object.keys(logic.dataSources ?? {})).toEqual(['searchItems']);
    expect((logic.dataSources ?? {}).searchItems).toEqual({
      operationRef: { operationId: 'demo.items.search', revision: '1' },
    });
    const serialized = JSON.stringify(replayed);
    expect(serialized.includes('traceId')).toBe(false);
    expect(serialized.includes('AbortController')).toBe(false);
    expect(replayed.components.searchBtn?.events?.onClick).toEqual([
      { type: 'executeDataSource', sourceId: 'searchItems', resultTo: 'state.rows' },
    ]);
  });

  it('重放是纯函数：输入 schema 不被变异', () => {
    const base = JSON.parse(JSON.stringify(fixture.baseSchema)) as PageSchema;
    const snapshot = JSON.stringify(base);
    applyPatchToSchema(base, fixture.patch);
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});
