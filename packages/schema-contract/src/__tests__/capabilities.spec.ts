import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { PageSchema } from '../types/schema';
import { SchemaValidationError } from '../validation/issues';
import {
  requireSupportedPageSchema,
  assertSupportedPageSchema,
  createCanonicalPageSchema,
} from '../canonicalize';
import {
  SCHEMA_CAPABILITIES,
  CONSUMER_SURFACES,
  REQUIRED_CAPABILITY_REVISION,
  CAPABILITY_ISSUE_CODES,
  type SchemaCapability,
  type ConsumerSurface,
  type CapabilityMatrix,
  type CapabilityManifest,
} from '../capabilities/types';
import {
  TRUSTED_CAPABILITY_MANIFEST,
  getTrustedCapabilityManifest,
  createTestCapabilityMatrix,
} from '../capabilities/manifest';
import { detectPageSchemaCapabilities } from '../capabilities/detect';
import { evaluatePageSchemaCapabilities } from '../capabilities/evaluate';

interface ConformanceFixture {
  schema: PageSchema;
  edgeSchema: PageSchema;
  legacySchema: PageSchema;
  negativeCases: Record<
    string,
    {
      schema: unknown;
      expectedCode: string;
      expectedPath: readonly (string | number)[];
    }
  >;
}

const fixturePath = path.resolve(
  __dirname,
  '../../../../test-fixtures/m1a-page-logic-conformance.json',
);

const conformanceFixture: ConformanceFixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const negativeCasesList = Object.entries(conformanceFixture.negativeCases).map(
  ([name, config]) => ({ name, ...config }),
);

describe('C3a Capability Gate & Support Matrix (Issue #47)', () => {
  describe('1. Immutable Trusted Capability Manifest', () => {
    it('declares all 3 capabilities across all 6 consumer surfaces with status=supported and revision=1', () => {
      expect(SCHEMA_CAPABILITIES).toEqual(['page-state', 'named-computed', 'action-flow']);
      expect(CONSUMER_SURFACES).toEqual([
        'contract',
        'validator',
        'editor-agent',
        'renderer',
        'compiler',
        'storage',
      ]);

      const manifest = getTrustedCapabilityManifest();
      expect(manifest).toBe(TRUSTED_CAPABILITY_MANIFEST);
      expect(manifest.manifestVersion).toBe(1);

      for (const cap of SCHEMA_CAPABILITIES) {
        expect(Object.prototype.hasOwnProperty.call(manifest.matrix, cap)).toBe(true);
        const surfaceRecord = manifest.matrix[cap]!;
        for (const surface of CONSUMER_SURFACES) {
          expect(Object.prototype.hasOwnProperty.call(surfaceRecord, surface)).toBe(true);
          const entry = surfaceRecord[surface]!;
          expect(entry).toEqual({
            status: 'supported',
            revision: REQUIRED_CAPABILITY_REVISION,
          });
        }
      }
    });

    it('is deeply frozen and rejects mutations in strict mode', () => {
      expect(Object.isFrozen(TRUSTED_CAPABILITY_MANIFEST)).toBe(true);
      expect(Object.isFrozen(TRUSTED_CAPABILITY_MANIFEST.matrix)).toBe(true);
      for (const cap of SCHEMA_CAPABILITIES) {
        expect(Object.isFrozen(TRUSTED_CAPABILITY_MANIFEST.matrix[cap])).toBe(true);
        for (const surface of CONSUMER_SURFACES) {
          expect(Object.isFrozen(TRUSTED_CAPABILITY_MANIFEST.matrix[cap]![surface])).toBe(true);
        }
      }

      expect(() => {
        // @ts-expect-error mutating frozen object
        TRUSTED_CAPABILITY_MANIFEST.matrix['page-state']!.compiler = {
          status: 'unsupported',
          revision: 1,
        };
      }).toThrow();
    });
  });

  describe('2. Conformance Corpus Acceptance under Trusted Manifest', () => {
    it('accepts main conformance schema with full logic declarations', () => {
      const result = evaluatePageSchemaCapabilities(conformanceFixture.schema);
      expect(result.ok).toBe(true);
      expect(result.issues).toEqual([]);

      const canonical = requireSupportedPageSchema(conformanceFixture.schema);
      expect(canonical).toBeDefined();
      expect(Object.isFrozen(canonical)).toBe(true);
      expect(canonical.logic?.states).toBeDefined();
      expect(canonical.logic?.computed).toBeDefined();
      expect(canonical.logic?.flows).toBeDefined();

      expect(() => assertSupportedPageSchema(conformanceFixture.schema)).not.toThrow();
    });

    it('accepts edge schema with computed semantics', () => {
      const result = evaluatePageSchemaCapabilities(conformanceFixture.edgeSchema);
      expect(result.ok).toBe(true);
      expect(result.issues).toEqual([]);

      const canonical = requireSupportedPageSchema(conformanceFixture.edgeSchema);
      expect(canonical).toBeDefined();
      expect(Object.isFrozen(canonical)).toBe(true);

      expect(() => assertSupportedPageSchema(conformanceFixture.edgeSchema)).not.toThrow();
    });

    it('accepts legacy schema without logic', () => {
      const result = evaluatePageSchemaCapabilities(conformanceFixture.legacySchema);
      expect(result.ok).toBe(true);
      expect(result.issues).toEqual([]);

      const canonical = requireSupportedPageSchema(conformanceFixture.legacySchema);
      expect(canonical).toBeDefined();
      expect(Object.isFrozen(canonical)).toBe(true);
      expect(canonical.logic).toBeUndefined();

      expect(() => assertSupportedPageSchema(conformanceFixture.legacySchema)).not.toThrow();
    });
  });

  describe('3. Pure Capability Detection (detectPageSchemaCapabilities)', () => {
    it('detects no capabilities for legacy schema without logic or runFlow', () => {
      const detected = detectPageSchemaCapabilities(conformanceFixture.legacySchema);
      expect(detected.size).toBe(0);
    });

    it('detects all 3 capabilities for main conformance schema with exact trigger paths', () => {
      const detected = detectPageSchemaCapabilities(conformanceFixture.schema);
      expect(detected.size).toBe(3);

      expect(detected.get('page-state')).toEqual({
        capability: 'page-state',
        primaryPath: ['logic', 'states'],
        allPaths: [['logic', 'states']],
      });

      expect(detected.get('named-computed')).toEqual({
        capability: 'named-computed',
        primaryPath: ['logic', 'computed'],
        allPaths: [['logic', 'computed']],
      });

      expect(detected.get('action-flow')?.capability).toBe('action-flow');
      expect(detected.get('action-flow')?.primaryPath).toEqual(['logic', 'flows']);
    });

    it('detects capability even on empty declarations ({})', () => {
      const schemaWithEmptyStates: PageSchema = {
        schemaVersion: 0,
        rootId: 'root',
        components: { root: { id: 'root', type: 'Page' } },
        logic: { states: {} },
      };
      const detectedStates = detectPageSchemaCapabilities(schemaWithEmptyStates);
      expect(detectedStates.has('page-state')).toBe(true);
      expect(detectedStates.get('page-state')?.primaryPath).toEqual(['logic', 'states']);

      const schemaWithEmptyComputed: PageSchema = {
        schemaVersion: 0,
        rootId: 'root',
        components: { root: { id: 'root', type: 'Page' } },
        logic: { computed: {} },
      };
      const detectedComputed = detectPageSchemaCapabilities(schemaWithEmptyComputed);
      expect(detectedComputed.has('named-computed')).toBe(true);
      expect(detectedComputed.get('named-computed')?.primaryPath).toEqual(['logic', 'computed']);

      const schemaWithEmptyFlows: PageSchema = {
        schemaVersion: 0,
        rootId: 'root',
        components: { root: { id: 'root', type: 'Page' } },
        logic: { flows: {} },
      };
      const detectedFlows = detectPageSchemaCapabilities(schemaWithEmptyFlows);
      expect(detectedFlows.has('action-flow')).toBe(true);
      expect(detectedFlows.get('action-flow')?.primaryPath).toEqual(['logic', 'flows']);
    });

    it('detects action-flow from top-level and nested runFlow actions across all valid containers', () => {
      // 1. Top-level in events
      const topLevelSchema: PageSchema = {
        schemaVersion: 0,
        rootId: 'root',
        components: {
          root: {
            id: 'root',
            type: 'Button',
            events: {
              onClick: [{ type: 'runFlow', flow: 'submit' }],
            },
          },
        },
      };
      const detectedTop = detectPageSchemaCapabilities(topLevelSchema);
      expect(detectedTop.has('action-flow')).toBe(true);
      expect(detectedTop.get('action-flow')?.primaryPath).toEqual([
        'components',
        'root',
        'events',
        'onClick',
        0,
      ]);

      // 2. Nested containers: if.then, if.else, loop.actions, apiCall.onSuccess, apiCall.onError, dialog.onOk, dialog.onCancel
      const nestedContainersSchema: PageSchema = {
        schemaVersion: 0,
        rootId: 'root',
        components: {
          root: {
            id: 'root',
            type: 'Page',
            events: {
              onEvent: [
                {
                  type: 'if',
                  condition: true,
                  then: [{ type: 'runFlow', flow: 'thenFlow' }],
                  else: [{ type: 'runFlow', flow: 'elseFlow' }],
                },
                {
                  type: 'loop',
                  over: [1],
                  itemVar: 'item',
                  actions: [{ type: 'runFlow', flow: 'loopFlow' }],
                },
                {
                  type: 'apiCall',
                  url: '/api/test',
                  onSuccess: [{ type: 'runFlow', flow: 'successFlow' }],
                  onError: [{ type: 'runFlow', flow: 'errorFlow' }],
                },
                {
                  type: 'dialog',
                  message: 'confirm',
                  onOk: [{ type: 'runFlow', flow: 'okFlow' }],
                  onCancel: [{ type: 'runFlow', flow: 'cancelFlow' }],
                },
              ],
            },
          },
        },
      };

      const detectedNested = detectPageSchemaCapabilities(nestedContainersSchema);
      expect(detectedNested.has('action-flow')).toBe(true);
      const allPaths = detectedNested.get('action-flow')?.allPaths;
      expect(allPaths).toEqual([
        ['components', 'root', 'events', 'onEvent', 0, 'then', 0],
        ['components', 'root', 'events', 'onEvent', 0, 'else', 0],
        ['components', 'root', 'events', 'onEvent', 1, 'actions', 0],
        ['components', 'root', 'events', 'onEvent', 2, 'onSuccess', 0],
        ['components', 'root', 'events', 'onEvent', 2, 'onError', 0],
        ['components', 'root', 'events', 'onEvent', 3, 'onOk', 0],
        ['components', 'root', 'events', 'onEvent', 3, 'onCancel', 0],
      ]);
    });

    it('does not mistake literal string text containing "runFlow" for an action-flow capability', () => {
      const textSchema: PageSchema = {
        schemaVersion: 0,
        rootId: 'root',
        components: {
          root: {
            id: 'root',
            type: 'Text',
            props: {
              children: 'This is not a runFlow action: {{ state.runFlow }}',
            },
          },
        },
      };
      const detected = detectPageSchemaCapabilities(textSchema);
      expect(detected.has('action-flow')).toBe(false);
    });
  });

  describe('4. Matrix Missing Unit Rejection (CAPABILITY_UNKNOWN)', () => {
    const singleCapSchemas: Record<SchemaCapability, PageSchema> = {
      'page-state': {
        schemaVersion: 0,
        rootId: 'root',
        components: { root: { id: 'root', type: 'Page' } },
        logic: { states: { count: 0 } },
      },
      'named-computed': {
        schemaVersion: 0,
        rootId: 'root',
        components: { root: { id: 'root', type: 'Page' } },
        logic: { computed: { double: '1 + 1' } },
      },
      'action-flow': {
        schemaVersion: 0,
        rootId: 'root',
        components: { root: { id: 'root', type: 'Page' } },
        logic: { flows: { testFlow: { steps: [] } } },
      },
    };

    const expectedPaths: Record<SchemaCapability, (string | number)[]> = {
      'page-state': ['logic', 'states'],
      'named-computed': ['logic', 'computed'],
      'action-flow': ['logic', 'flows'],
    };

    describe.each(SCHEMA_CAPABILITIES)('capability: %s', (cap) => {
      describe.each(CONSUMER_SURFACES)('surface: %s', (surface) => {
        it(`rejects when ${cap}.${surface} is missing from matrix`, () => {
          const matrix = createTestCapabilityMatrix({
            [cap]: {
              [surface]: undefined,
            },
          });

          const schema = singleCapSchemas[cap];
          const result = evaluatePageSchemaCapabilities(schema, matrix);

          expect(result.ok).toBe(false);
          expect(result.issues).toHaveLength(1);
          expect(result.issues[0].code).toBe(CAPABILITY_ISSUE_CODES.UNKNOWN);
          expect(result.issues[0].path).toEqual(expectedPaths[cap]);
          expect(result.issues[0].message).toContain(cap);
          expect(result.issues[0].message).toContain(surface);
        });
      });
    });

    it('rejects when an entire capability entry is missing from manifest', () => {
      const base = createTestCapabilityMatrix();
      const strippedMatrix = { ...base };
      delete strippedMatrix['page-state'];

      const result = evaluatePageSchemaCapabilities(singleCapSchemas['page-state'], strippedMatrix);
      expect(result.ok).toBe(false);
      expect(result.issues.length).toBe(CONSUMER_SURFACES.length);
      for (const issue of result.issues) {
        expect(issue.code).toBe(CAPABILITY_ISSUE_CODES.UNKNOWN);
        expect(issue.path).toEqual(['logic', 'states']);
      }
    });

    it('rejects prototype-inherited configurations and only accepts own properties', () => {
      const proto = {
        compiler: { status: 'supported', revision: 1 },
      };
      const capRecordWithoutOwnCompiler = Object.create(proto);
      capRecordWithoutOwnCompiler.contract = { status: 'supported', revision: 1 };
      capRecordWithoutOwnCompiler.validator = { status: 'supported', revision: 1 };
      capRecordWithoutOwnCompiler['editor-agent'] = { status: 'supported', revision: 1 };
      capRecordWithoutOwnCompiler.renderer = { status: 'supported', revision: 1 };
      capRecordWithoutOwnCompiler.storage = { status: 'supported', revision: 1 };

      const matrixWithPrototypeInheritance: CapabilityMatrix = {
        'page-state': capRecordWithoutOwnCompiler,
      };

      const result = evaluatePageSchemaCapabilities(
        singleCapSchemas['page-state'],
        matrixWithPrototypeInheritance,
      );

      expect(result.ok).toBe(false);
      const compilerIssue = result.issues.find((i) => i.message.includes('compiler'));
      expect(compilerIssue).toBeDefined();
      expect(compilerIssue?.code).toBe(CAPABILITY_ISSUE_CODES.UNKNOWN);
    });
  });

  describe('5. Unsupported Status Rejection (CAPABILITY_UNSUPPORTED)', () => {
    describe.each(SCHEMA_CAPABILITIES)('capability: %s', (cap) => {
      describe.each(CONSUMER_SURFACES)('surface: %s', (surface) => {
        it(`rejects when ${cap}.${surface} has status='unsupported'`, () => {
          const matrix = createTestCapabilityMatrix({
            [cap]: {
              [surface]: { status: 'unsupported', revision: 1 },
            },
          });

          const schema: PageSchema = {
            schemaVersion: 0,
            rootId: 'root',
            components: { root: { id: 'root', type: 'Page' } },
            logic: {
              ...(cap === 'page-state' ? { states: { count: 0 } } : {}),
              ...(cap === 'named-computed' ? { computed: { c: '1' } } : {}),
              ...(cap === 'action-flow' ? { flows: { f: { steps: [] } } } : {}),
            },
          };

          const result = evaluatePageSchemaCapabilities(schema, matrix);
          expect(result.ok).toBe(false);
          expect(result.issues).toHaveLength(1);
          expect(result.issues[0].code).toBe(CAPABILITY_ISSUE_CODES.UNSUPPORTED);
          expect(result.issues[0].message).toContain(cap);
          expect(result.issues[0].message).toContain(surface);
          expect(result.issues[0].message).toContain('required revision 1');
        });
      });
    });
  });

  describe('6. Revision Mismatch Rejection (CAPABILITY_REVISION_MISMATCH)', () => {
    it.each([0, 2, 99])('rejects when revision is %i (expected 1)', (badRevision) => {
      const matrix = createTestCapabilityMatrix({
        'page-state': {
          compiler: { status: 'supported', revision: badRevision },
        },
      });

      const schema: PageSchema = {
        schemaVersion: 0,
        rootId: 'root',
        components: { root: { id: 'root', type: 'Page' } },
        logic: { states: { count: 0 } },
      };

      const result = evaluatePageSchemaCapabilities(schema, matrix);
      expect(result.ok).toBe(false);
      expect(result.issues).toHaveLength(1);
      if (badRevision === 0) {
        // 0 is invalid revision
        expect(result.issues[0].code).toBe(CAPABILITY_ISSUE_CODES.MANIFEST_INVALID);
      } else {
        expect(result.issues[0].code).toBe(CAPABILITY_ISSUE_CODES.REVISION_MISMATCH);
        expect(result.issues[0].message).toContain('required revision 1');
        expect(result.issues[0].message).toContain(`manifest specifies revision ${badRevision}`);
      }
    });
  });

  describe('7. Malformed Manifest Rejection (CAPABILITY_MANIFEST_INVALID)', () => {
    const testSchema: PageSchema = {
      schemaVersion: 0,
      rootId: 'root',
      components: { root: { id: 'root', type: 'Page' } },
      logic: { states: { count: 0 } },
    };

    it.each([
      ['null entry', null],
      ['string entry', 'supported'],
      ['number entry', 1],
      ['array entry', [{ status: 'supported' }]],
      ['invalid status', { status: 'experimental', revision: 1 }],
      ['non-number revision', { status: 'supported', revision: '1' }],
      ['float revision', { status: 'supported', revision: 1.5 }],
      ['negative revision', { status: 'supported', revision: -1 }],
      ['NaN revision', { status: 'supported', revision: Number.NaN }],
    ])('rejects entry with %s', (_, badEntry) => {
      const matrix = createTestCapabilityMatrix({
        'page-state': {
          compiler: badEntry,
        },
      });

      const result = evaluatePageSchemaCapabilities(testSchema, matrix);
      expect(result.ok).toBe(false);
      expect(result.issues[0].code).toBe(CAPABILITY_ISSUE_CODES.MANIFEST_INVALID);
    });

    it('rejects non-object manifest or non-object matrix', () => {
      expect(evaluatePageSchemaCapabilities(testSchema, null).issues[0].code).toBe(
        CAPABILITY_ISSUE_CODES.MANIFEST_INVALID,
      );
      expect(evaluatePageSchemaCapabilities(testSchema, 'invalid').issues[0].code).toBe(
        CAPABILITY_ISSUE_CODES.MANIFEST_INVALID,
      );
      expect(
        evaluatePageSchemaCapabilities(testSchema, { matrix: 'not-an-object' }).issues[0].code,
      ).toBe(CAPABILITY_ISSUE_CODES.MANIFEST_INVALID);
    });
  });

  describe('8. Strict Conjunction (All 6 surfaces required, not any/some)', () => {
    it('fails when 5 surfaces are supported and only 1 surface is unsupported', () => {
      const matrix = createTestCapabilityMatrix({
        'page-state': {
          contract: { status: 'supported', revision: 1 },
          validator: { status: 'supported', revision: 1 },
          'editor-agent': { status: 'supported', revision: 1 },
          renderer: { status: 'supported', revision: 1 },
          compiler: { status: 'unsupported', revision: 1 }, // 1 unsupported surface
          storage: { status: 'supported', revision: 1 },
        },
      });

      const schema: PageSchema = {
        schemaVersion: 0,
        rootId: 'root',
        components: { root: { id: 'root', type: 'Page' } },
        logic: { states: { count: 0 } },
      };

      const result = evaluatePageSchemaCapabilities(schema, matrix);
      expect(result.ok).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].code).toBe(CAPABILITY_ISSUE_CODES.UNSUPPORTED);
      expect(result.issues[0].message).toContain('compiler');
    });
  });

  describe('9. Legacy Schema Protection against Blocked Manifests', () => {
    it('passes legacy schema even when all capabilities on all surfaces are blocked', () => {
      const allBlockedMatrix = createTestCapabilityMatrix({
        'page-state': {
          contract: { status: 'unsupported', revision: 1 },
          validator: { status: 'unsupported', revision: 1 },
          'editor-agent': { status: 'unsupported', revision: 1 },
          renderer: { status: 'unsupported', revision: 1 },
          compiler: { status: 'unsupported', revision: 1 },
          storage: { status: 'unsupported', revision: 1 },
        },
        'named-computed': {
          contract: { status: 'unsupported', revision: 1 },
          validator: { status: 'unsupported', revision: 1 },
          'editor-agent': { status: 'unsupported', revision: 1 },
          renderer: { status: 'unsupported', revision: 1 },
          compiler: { status: 'unsupported', revision: 1 },
          storage: { status: 'unsupported', revision: 1 },
        },
        'action-flow': {
          contract: { status: 'unsupported', revision: 1 },
          validator: { status: 'unsupported', revision: 1 },
          'editor-agent': { status: 'unsupported', revision: 1 },
          renderer: { status: 'unsupported', revision: 1 },
          compiler: { status: 'unsupported', revision: 1 },
          storage: { status: 'unsupported', revision: 1 },
        },
      });

      const result = evaluatePageSchemaCapabilities(
        conformanceFixture.legacySchema,
        allBlockedMatrix,
      );
      expect(result.ok).toBe(true);
      expect(result.issues).toEqual([]);

      const canonical = requireSupportedPageSchema(
        conformanceFixture.legacySchema,
        undefined,
        allBlockedMatrix,
      );
      expect(canonical).toBeDefined();
      expect(canonical.logic).toBeUndefined();

      expect(() =>
        assertSupportedPageSchema(conformanceFixture.legacySchema, undefined, allBlockedMatrix),
      ).not.toThrow();
    });
  });

  describe('10. Public Supported Gate Integration (requireSupported & assertSupported)', () => {
    const blockedCompilerMatrix = createTestCapabilityMatrix({
      'action-flow': {
        compiler: { status: 'unsupported', revision: 1 },
      },
    });

    it('requireSupportedPageSchema throws SchemaValidationError with capability issues when blocked', () => {
      let caughtError: unknown;
      try {
        requireSupportedPageSchema(conformanceFixture.schema, undefined, blockedCompilerMatrix);
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(SchemaValidationError);
      const validationError = caughtError as SchemaValidationError;
      expect(validationError.issues[0].code).toBe(CAPABILITY_ISSUE_CODES.UNSUPPORTED);
      expect(validationError.issues[0].path).toEqual(['logic', 'flows']);
      expect(validationError.issues[0].message).toContain('compiler');
    });

    it('assertSupportedPageSchema throws SchemaValidationError with capability issues when blocked', () => {
      expect(() =>
        assertSupportedPageSchema(conformanceFixture.schema, undefined, blockedCompilerMatrix),
      ).toThrow(SchemaValidationError);
    });

    it('createCanonicalPageSchema does NOT enforce capability gate (structural only)', () => {
      // createCanonicalPageSchema must remain structural canonicalization only to prevent cycles
      const canonical = createCanonicalPageSchema(conformanceFixture.schema);
      expect(canonical).toBeDefined();
      expect(canonical.logic?.flows).toBeDefined();
    });

    it('rejects via real requireSupportedPageSchema when trusted manifest module is replaced in test isolation', async () => {
      vi.resetModules();
      vi.doMock('../capabilities/manifest', () => ({
        TRUSTED_CAPABILITY_MANIFEST: {
          manifestVersion: 1,
          matrix: createTestCapabilityMatrix({
            'page-state': { compiler: { status: 'unsupported', revision: 1 } },
          }),
        },
        getTrustedCapabilityManifest: () => ({
          manifestVersion: 1,
          matrix: createTestCapabilityMatrix({
            'page-state': { compiler: { status: 'unsupported', revision: 1 } },
          }),
        }),
        createTestCapabilityMatrix,
      }));

      try {
        const isolatedCanonicalize = await import('../canonicalize');
        const isolatedIssues = await import('../validation/issues');
        // Calling real requireSupportedPageSchema with NO manifest argument
        expect(() =>
          isolatedCanonicalize.requireSupportedPageSchema(conformanceFixture.schema),
        ).toThrow(isolatedIssues.SchemaValidationError);

        let caughtError: unknown;
        try {
          isolatedCanonicalize.requireSupportedPageSchema(conformanceFixture.schema);
        } catch (err) {
          caughtError = err;
        }
        expect(caughtError).toBeInstanceOf(isolatedIssues.SchemaValidationError);
        expect((caughtError as Error).name).toBe('SchemaValidationError');
        const issues = (caughtError as SchemaValidationError).issues;
        expect(issues[0].code).toBe(CAPABILITY_ISSUE_CODES.UNSUPPORTED);
        expect(issues[0].path).toEqual(['logic', 'states']);
        expect(issues[0].message).toContain('compiler');
      } finally {
        vi.doUnmock('../capabilities/manifest');
        vi.resetModules();
      }
    });
  });

  describe('11. Structural Errors Priority and Nine Negative Cases Invariance', () => {
    it.each(negativeCasesList)(
      'structural issue takes precedence on negative case: $name',
      (negativeCase) => {
        // Even with a blocked matrix, structural issue must be detected first with exact expectedCode and expectedPath
        const blockedMatrix = createTestCapabilityMatrix({
          'page-state': { compiler: { status: 'unsupported', revision: 1 } },
        });

        let caughtError: unknown;
        try {
          requireSupportedPageSchema(negativeCase.schema, undefined, blockedMatrix);
        } catch (err) {
          caughtError = err;
        }

        expect(caughtError).toBeInstanceOf(SchemaValidationError);
        const issues = (caughtError as SchemaValidationError).issues;
        expect(issues.some((i) => i.code === negativeCase.expectedCode)).toBe(true);
        const matchingIssue = issues.find((i) => i.code === negativeCase.expectedCode);
        expect(matchingIssue?.path).toEqual(negativeCase.expectedPath);
      },
    );
  });
});
