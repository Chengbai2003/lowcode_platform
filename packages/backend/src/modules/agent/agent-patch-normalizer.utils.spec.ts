import { PageSchema } from '../schema-context';
import { EditorPatchOperation } from '../agent-tools/types/editor-patch.types';
import { normalizeFinalPatch } from './agent-patch-normalizer.utils';

function createSchema(): PageSchema {
  return {
    schemaVersion: 0,
    rootId: 'root',
    components: {
      root: { id: 'root', type: 'Page', childrenIds: ['btn'] },
      btn: { id: 'btn', type: 'Button', props: { children: 'Test' } },
    },
  };
}

describe('normalizeFinalPatch', () => {
  it('filters out replacePageLogic when logic is identical', () => {
    const baseSchema: PageSchema = {
      ...createSchema(),
      logic: {
        states: { count: 1 },
        computed: { double: 'state.count * 2' },
      },
    };
    const patch: EditorPatchOperation[] = [
      {
        op: 'replacePageLogic',
        logic: {
          states: { count: 1 },
          computed: { double: 'state.count * 2' },
        },
      },
    ];

    const result = normalizeFinalPatch(baseSchema, patch);
    expect(result).toHaveLength(0);
  });

  it('filters out replacePageLogic when only expression whitespace differs', () => {
    const baseSchema: PageSchema = {
      ...createSchema(),
      logic: {
        states: { count: 1 },
        computed: { double: 'state.count * 2' },
      },
    };
    const patch: EditorPatchOperation[] = [
      {
        op: 'replacePageLogic',
        logic: {
          states: { count: 1 },
          computed: { double: '  state.count * 2  ' },
        },
      },
    ];

    const result = normalizeFinalPatch(baseSchema, patch);
    expect(result).toHaveLength(0);
  });

  it('filters out replacePageLogic when baseSchema logic has null prototype and patch has Object.prototype', () => {
    const nullProtoLogic = Object.assign(Object.create(null), {
      states: Object.assign(Object.create(null), { count: 1 }),
      computed: Object.assign(Object.create(null), { double: 'state.count * 2' }),
    });
    const baseSchema: PageSchema = {
      ...createSchema(),
      logic: nullProtoLogic,
    };
    const patch: EditorPatchOperation[] = [
      {
        op: 'replacePageLogic',
        logic: {
          states: { count: 1 },
          computed: { double: 'state.count * 2' },
        },
      },
    ];

    const result = normalizeFinalPatch(baseSchema, patch);
    expect(result).toHaveLength(0);
  });

  it('filters out replacePageLogic when baseSchema has no logic and patch sets empty logic', () => {
    const baseSchema = createSchema();
    const patch: EditorPatchOperation[] = [
      {
        op: 'replacePageLogic',
        logic: {},
      },
    ];

    const result = normalizeFinalPatch(baseSchema, patch);
    expect(result).toHaveLength(0);
  });

  it('preserves replacePageLogic and canonicalizes expression whitespace when logic actually changes', () => {
    const baseSchema: PageSchema = {
      ...createSchema(),
      logic: {
        states: { count: 1 },
      },
    };
    const patch: EditorPatchOperation[] = [
      {
        op: 'replacePageLogic',
        logic: {
          states: { count: 2 },
          computed: { double: '  state.count * 2  ' },
        },
      },
    ];

    const result = normalizeFinalPatch(baseSchema, patch);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      op: 'replacePageLogic',
      logic: {
        states: { count: 2 },
        computed: { double: 'state.count * 2' },
      },
    });
  });

  it('preserves replacePageLogic when clearing non-empty logic', () => {
    const baseSchema: PageSchema = {
      ...createSchema(),
      logic: {
        states: { count: 1 },
      },
    };
    const patch: EditorPatchOperation[] = [
      {
        op: 'replacePageLogic',
        logic: {},
      },
    ];

    const result = normalizeFinalPatch(baseSchema, patch);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      op: 'replacePageLogic',
      logic: {},
    });
  });
});
