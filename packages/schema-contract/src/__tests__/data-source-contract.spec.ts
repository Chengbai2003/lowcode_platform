import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { PageSchema } from '../types/schema';
import { SchemaValidationError } from '../validation/issues';
import { createCanonicalPageSchema, requireSupportedPageSchema } from '../canonicalize';
import {
  CAPABILITY_ISSUE_CODES,
  CONSUMER_SURFACES,
  SCHEMA_CAPABILITIES,
} from '../capabilities/types';
import { createTestCapabilityMatrix } from '../capabilities/manifest';
import { detectPageSchemaCapabilities } from '../capabilities/detect';
import { evaluatePageSchemaCapabilities } from '../capabilities/evaluate';
import { analyzeActionFlowDeclarations } from '../action-flow';

interface DataSourceNegativeCase {
  name: string;
  mutation: string;
  schema: unknown;
  expectedCode: string;
  expectedPath: readonly (string | number)[];
}

interface DataSourceConformanceFixture {
  corpusVersion: string;
  schema: PageSchema;
  flowSchema: PageSchema;
  legacyApiCallSchema: PageSchema;
  negativeCases: Record<string, DataSourceNegativeCase>;
}

const fixturePath = path.resolve(
  __dirname,
  '../../../../test-fixtures/m1b-datasource-conformance.json',
);

const fixture: DataSourceConformanceFixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const negativeCasesList = Object.values(fixture.negativeCases).map((config) => ({
  name: config.name,
  ...config,
}));

describe('M1b-1 PR A: DataSource Declarations & executeDataSource Contract (Refs #64 design)', () => {
  describe('1. 结构合法：规范化、键排序、字段顺序与往返保真', () => {
    it('legal schema passes structural canonicalization (createCanonicalPageSchema) with declarations preserved', () => {
      const canonical = createCanonicalPageSchema(fixture.schema);
      expect(canonical).toBeDefined();
      expect(Object.isFrozen(canonical)).toBe(true);
      expect(canonical.logic?.states).toEqual({ query: '', rows: [] });
      expect(canonical.logic?.dataSources).toBeDefined();
      const declaration = (canonical.logic?.dataSources as Record<string, unknown>)
        .searchItems as Record<string, unknown>;
      expect(declaration.operationRef).toEqual({
        operationId: 'demo.items.search',
        revision: '1',
      });
      expect(declaration.params).toEqual({ query: '{{ state.query }}' });
    });

    it('canonical dataSources are key-sorted with fixed declaration field order (operationRef → params)', () => {
      const schema: PageSchema = {
        schemaVersion: 0,
        rootId: 'root',
        components: { root: { id: 'root', type: 'Page' } },
        logic: {
          states: { rows: [] },
          dataSources: {
            zSearch: {
              params: { query: 'z' },
              operationRef: { revision: '2', operationId: 'demo.items.search' },
            },
            aSearch: {
              operationRef: { operationId: 'demo.items.search', revision: '1' },
            },
          },
        },
      };
      const canonical = createCanonicalPageSchema(schema);
      const dataSources = canonical.logic?.dataSources as unknown as Record<string, unknown>;
      expect(Object.getOwnPropertyNames(dataSources)).toEqual(['aSearch', 'zSearch']);

      const zDecl = dataSources.zSearch as Record<string, unknown>;
      // 固定字段顺序：operationRef（operationId → revision）在前，params 在后
      expect(Object.getOwnPropertyNames(zDecl)).toEqual(['operationRef', 'params']);
      const zRef = zDecl.operationRef as Record<string, unknown>;
      expect(Object.getOwnPropertyNames(zRef)).toEqual(['operationId', 'revision']);
      // 输入的 operationRef 键顺序（revision 在前）被规范化纠正
      expect(zRef).toEqual({ operationId: 'demo.items.search', revision: '2' });
    });

    it('JSON roundtrip fidelity: canonical dataSources survive serialize/parse without loss', () => {
      const canonical = createCanonicalPageSchema(fixture.schema);
      const roundtrip = JSON.parse(JSON.stringify(canonical.logic?.dataSources)) as unknown;
      expect(roundtrip).toEqual(fixture.schema.logic?.dataSources);
    });

    it('flow schema with executeDataSource nested in if/loop passes structural canonicalization', () => {
      const canonical = createCanonicalPageSchema(fixture.flowSchema);
      expect(canonical).toBeDefined();
      expect(canonical.logic?.flows).toBeDefined();
    });
  });

  describe('2. 结构非法：声明与动作的 fail-close 用例（独立语料）', () => {
    it.each(negativeCasesList)('rejects negative case: $name', (negativeCase) => {
      let caught: unknown;
      try {
        createCanonicalPageSchema(negativeCase.schema);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(SchemaValidationError);
      const issues = (caught as SchemaValidationError).issues;
      const matching = issues.find((i) => i.code === negativeCase.expectedCode);
      expect(
        matching,
        `expected issue ${negativeCase.expectedCode} in ${JSON.stringify(issues.map((i) => i.code))}`,
      ).toBeDefined();
      expect(matching?.path).toEqual(negativeCase.expectedPath);
    });
  });

  describe('3. 预算与长度上限（宿主控制，Schema 不可放宽）', () => {
    const baseDeclaration = (id: string) => ({
      operationRef: { operationId: id, revision: '1' },
    });

    const buildSchema = (
      dataSources: Record<string, unknown>,
      states: Record<string, unknown> = { rows: [] },
    ): PageSchema => ({
      schemaVersion: 0,
      rootId: 'root',
      components: { root: { id: 'root', type: 'Page' } },
      logic: { states, dataSources },
    });

    const expectSingleIssue = (schema: PageSchema, code: string) => {
      let caught: unknown;
      try {
        createCanonicalPageSchema(schema);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(SchemaValidationError);
      const issues = (caught as SchemaValidationError).issues;
      expect(issues.some((i) => i.code === code)).toBe(true);
    };

    it('rejects more than 20 dataSource declarations (DATASOURCE_ENTRIES_BUDGET_EXCEEDED)', () => {
      const dataSources: Record<string, unknown> = {};
      for (let i = 0; i < 21; i++) {
        dataSources[`source${i}`] = baseDeclaration('demo.items.search');
      }
      expectSingleIssue(buildSchema(dataSources), 'DATASOURCE_ENTRIES_BUDGET_EXCEEDED');
    });

    it('accepts exactly 20 dataSource declarations within budget', () => {
      const dataSources: Record<string, unknown> = {};
      for (let i = 0; i < 20; i++) {
        dataSources[`source${i}`] = baseDeclaration('demo.items.search');
      }
      expect(() => createCanonicalPageSchema(buildSchema(dataSources))).not.toThrow();
    });

    it('rejects more than 20 params entries (DATASOURCE_PARAMS_BUDGET_EXCEEDED)', () => {
      const params: Record<string, unknown> = {};
      for (let i = 0; i < 21; i++) {
        params[`p${i}`] = i;
      }
      expectSingleIssue(
        buildSchema({ search: { ...baseDeclaration('demo.items.search'), params } }),
        'DATASOURCE_PARAMS_BUDGET_EXCEEDED',
      );
    });

    it('rejects operationId longer than 128 chars and revision longer than 32 chars', () => {
      const longId = `demo.${'a'.repeat(130)}`;
      expectSingleIssue(buildSchema({ search: baseDeclaration(longId) }), 'INVALID_OPERATION_ID');
      const longRevision = 'r'.repeat(33);
      expectSingleIssue(
        buildSchema({
          search: { operationRef: { operationId: 'demo.items.search', revision: longRevision } },
        }),
        'INVALID_OPERATION_REVISION',
      );
    });

    it('normalizeValidationLimits enforces hard caps for the new limits', async () => {
      const { normalizeValidationLimits, DEFAULT_SCHEMA_LIMITS } = await import('../types/limits');
      expect(DEFAULT_SCHEMA_LIMITS.maxDataSourceEntries).toBe(20);
      expect(DEFAULT_SCHEMA_LIMITS.maxDataSourceParamEntries).toBe(20);
      expect(DEFAULT_SCHEMA_LIMITS.maxOperationIdLength).toBe(128);
      expect(DEFAULT_SCHEMA_LIMITS.maxOperationRevisionLength).toBe(32);
      expect(() => normalizeValidationLimits({ maxDataSourceEntries: 101 })).toThrow(TypeError);
      expect(() => normalizeValidationLimits({ maxDataSourceParamEntries: 0 })).toThrow(TypeError);
      expect(() => normalizeValidationLimits({ maxOperationIdLength: 257 })).toThrow(TypeError);
      expect(() => normalizeValidationLimits({ maxOperationRevisionLength: 129 })).toThrow(
        TypeError,
      );
      expect(normalizeValidationLimits({ maxDataSourceEntries: 5 }).maxDataSourceEntries).toBe(5);
    });
  });

  describe('4. executeDataSource 严格目标语法（不放宽 legacy，不收紧 apiCall）', () => {
    const buildActionSchema = (
      eventsAction: Record<string, unknown>,
      logicExtra: Record<string, unknown> = {},
      withStates = true,
    ): PageSchema => ({
      schemaVersion: 0,
      rootId: 'root',
      components: {
        root: { id: 'root', type: 'Page', events: { onClick: [eventsAction] } },
      },
      logic: {
        ...(withStates ? { states: { rows: [] } } : {}),
        dataSources: {
          searchItems: { operationRef: { operationId: 'demo.items.search', revision: '1' } },
        },
        ...logicExtra,
      },
    });

    it('strict resultTo is enforced even without logic.states (no legacy relaxation for the new action)', () => {
      let caught: unknown;
      try {
        createCanonicalPageSchema(
          buildActionSchema(
            {
              type: 'executeDataSource',
              sourceId: 'searchItems',
              resultTo: 'data.rows',
            },
            {},
            false,
          ),
        );
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(SchemaValidationError);
      const issues = (caught as SchemaValidationError).issues;
      expect(issues.some((i) => i.code === 'INVALID_STATE_TARGET')).toBe(true);
    });

    it('legacy apiCall nested resultTo (data.*) is still accepted when no states are declared (不收紧旧动作)', () => {
      expect(() => createCanonicalPageSchema(fixture.legacyApiCallSchema)).not.toThrow();
    });

    it('apiCall keeps its existing top-level state target semantics alongside the new action', () => {
      const schema: PageSchema = {
        schemaVersion: 0,
        rootId: 'root',
        components: {
          root: {
            id: 'root',
            type: 'Page',
            events: {
              onClick: [
                { type: 'apiCall', url: '/api/items', resultTo: 'state.rows' },
                {
                  type: 'executeDataSource',
                  sourceId: 'searchItems',
                  resultTo: 'state.rows',
                },
              ],
            },
          },
        },
        logic: {
          states: { rows: [] },
          dataSources: {
            searchItems: { operationRef: { operationId: 'demo.items.search', revision: '1' } },
          },
        },
      };
      expect(() => createCanonicalPageSchema(schema)).not.toThrow();
    });
  });

  describe('4b. 声明冲突校验（m1b-0 设计 §3.1：dataSources key 参与声明冲突校验）', () => {
    const declaration = {
      operationRef: { operationId: 'demo.items.search', revision: '1' },
    };

    const expectConflict = (logic: Record<string, unknown>, regionInMessage: string) => {
      let caught: unknown;
      try {
        createCanonicalPageSchema({
          schemaVersion: 0,
          rootId: 'root',
          components: { root: { id: 'root', type: 'Page' } },
          logic: logic as never,
        });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(SchemaValidationError);
      const issues = (caught as SchemaValidationError).issues;
      const matching = issues.find((i) => i.code === 'DATASOURCE_KEY_CONFLICT');
      expect(matching).toBeDefined();
      expect(matching?.path).toEqual(['logic', 'dataSources', 'searchItems']);
      expect(matching?.message).toContain(regionInMessage);
    };

    it('rejects a dataSource key that duplicates a states declaration', () => {
      expectConflict(
        { states: { searchItems: '' }, dataSources: { searchItems: declaration } },
        'states',
      );
    });

    it('rejects a dataSource key that duplicates a computed declaration', () => {
      expectConflict(
        { computed: { searchItems: '1' }, dataSources: { searchItems: declaration } },
        'computed',
      );
    });

    it('rejects a dataSource key that duplicates a flows declaration', () => {
      expectConflict(
        {
          flows: { searchItems: { steps: [{ type: 'log', value: 'x' }] } },
          dataSources: { searchItems: declaration },
        },
        'flows',
      );
    });

    it('legacy cross-region overlap between states/computed/flows remains legal（不收紧旧能力）', () => {
      expect(() =>
        createCanonicalPageSchema({
          schemaVersion: 0,
          rootId: 'root',
          components: { root: { id: 'root', type: 'Page' } },
          logic: {
            states: { shared: 1 },
            computed: { shared: '1 + 1' },
            flows: { shared: { steps: [{ type: 'log', value: 'ok' }] } },
          },
        }),
      ).not.toThrow();
    });

    it('distinct dataSource keys do not conflict with other declarations', () => {
      expect(() =>
        createCanonicalPageSchema({
          schemaVersion: 0,
          rootId: 'root',
          components: { root: { id: 'root', type: 'Page' } },
          logic: {
            states: { rows: [] },
            dataSources: { searchItems: declaration },
          },
        }),
      ).not.toThrow();
    });
  });

  describe('5. 能力检测与评估：结构合法但生产默认拒绝', () => {
    it('detects data-source from declarations, direct event actions, and nested flow actions', () => {
      const fromDeclaration = detectPageSchemaCapabilities(
        createCanonicalPageSchema(fixture.schema),
      );
      expect(Array.from(fromDeclaration.keys()).sort()).toEqual(['data-source', 'page-state']);
      expect(fromDeclaration.get('data-source')?.allPaths).toEqual([
        ['logic', 'dataSources'],
        ['components', 'searchBtn', 'events', 'onClick', 0],
      ]);

      const fromFlow = detectPageSchemaCapabilities(createCanonicalPageSchema(fixture.flowSchema));
      expect(Array.from(fromFlow.keys()).sort()).toEqual([
        'action-flow',
        'data-source',
        'page-state',
      ]);
      const allPaths = fromFlow.get('data-source')?.allPaths as (string | number)[][];
      expect(allPaths).toContainEqual(['logic', 'flows', 'searchFlow', 'steps', 0, 'then', 0]);
      expect(allPaths).toContainEqual(['logic', 'flows', 'searchFlow', 'steps', 1, 'actions', 0]);
    });

    it('action-only schema (executeDataSource without declarations) still detects data-source', () => {
      const schema: PageSchema = {
        schemaVersion: 0,
        rootId: 'root',
        components: {
          root: {
            id: 'root',
            type: 'Page',
            events: {
              onClick: [
                { type: 'executeDataSource', sourceId: 'searchItems', resultTo: 'state.rows' },
              ],
            },
          },
        },
        logic: { states: { rows: [] } },
      };
      // 结构上会先报 DATASOURCE_REFERENCE_MISSING（fail-close），但检测器独立可用
      const detected = detectPageSchemaCapabilities(schema);
      expect(detected.has('data-source')).toBe(true);
      expect(detected.get('data-source')?.primaryPath).toEqual([
        'components',
        'root',
        'events',
        'onClick',
        0,
      ]);
    });

    it('legacy schema with only apiCall detects no capabilities (apiCall 不是能力触发器)', () => {
      const detected = detectPageSchemaCapabilities(fixture.legacyApiCallSchema);
      expect(detected.size).toBe(0);
    });

    it('production trusted manifest rejects structurally-legal datasource schemas on all 6 surfaces', () => {
      for (const schema of [fixture.schema, fixture.flowSchema]) {
        const result = evaluatePageSchemaCapabilities(schema);
        expect(result.ok).toBe(false);
        expect(result.issues).toHaveLength(CONSUMER_SURFACES.length);
        for (const issue of result.issues) {
          expect(issue.code).toBe(CAPABILITY_ISSUE_CODES.UNSUPPORTED);
          expect(issue.message).toContain('data-source');
        }

        let caught: unknown;
        try {
          requireSupportedPageSchema(schema);
        } catch (err) {
          caught = err;
        }
        expect(caught).toBeInstanceOf(SchemaValidationError);
        const issues = (caught as SchemaValidationError).issues;
        expect(issues.every((i) => i.code === CAPABILITY_ISSUE_CODES.UNSUPPORTED)).toBe(true);
      }
    });

    it('trusted-test matrix with data-source supported accepts the same schema（证明拒绝来自能力门禁而非结构）', () => {
      const supportedAll: Record<string, unknown> = {};
      for (const surface of CONSUMER_SURFACES) {
        supportedAll[surface] = { status: 'supported', revision: 1 };
      }
      const matrix = createTestCapabilityMatrix({ 'data-source': supportedAll });
      const result = evaluatePageSchemaCapabilities(fixture.schema, matrix);
      expect(result.ok).toBe(true);
      expect(result.issues).toEqual([]);
      expect(SCHEMA_CAPABILITIES).toContain('data-source');
    });
  });

  describe('6. analyzeActionFlowDeclarations 的显式声明集合传入', () => {
    const flows = {
      searchFlow: {
        steps: [{ type: 'executeDataSource', sourceId: 'searchItems', resultTo: 'state.rows' }],
      },
    };

    it('defaults to empty declaration sets and fails close on executeDataSource references', () => {
      const result = analyzeActionFlowDeclarations(flows);
      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.code === 'DATASOURCE_REFERENCE_MISSING')).toBe(true);
    });

    it('accepts executeDataSource when declared sets are explicitly provided via options', () => {
      const result = analyzeActionFlowDeclarations(flows, undefined, ['logic', 'flows'], {
        declaredDataSourceKeys: new Set(['searchItems']),
        declaredStateKeys: new Set(['rows']),
      });
      expect(result.ok).toBe(true);
    });

    it('still rejects undeclared resultTo targets inside flows even with dataSource declared', () => {
      const badFlows = {
        searchFlow: {
          steps: [
            {
              type: 'executeDataSource',
              sourceId: 'searchItems',
              resultTo: 'state.undeclared',
            },
          ],
        },
      };
      const result = analyzeActionFlowDeclarations(badFlows, undefined, ['logic', 'flows'], {
        declaredDataSourceKeys: new Set(['searchItems']),
        declaredStateKeys: new Set(['rows']),
      });
      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.code === 'UNDECLARED_STATE_TARGET')).toBe(true);
    });
  });
});
