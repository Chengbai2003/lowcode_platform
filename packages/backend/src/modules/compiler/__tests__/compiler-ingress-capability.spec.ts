import * as path from 'path';
import { BadRequestException } from '@nestjs/common';
import * as contract from '@lowcode-platform/schema-contract';
import { CompilerService } from '../compiler.service';
import { compileToCode } from '../generator';
import { PageSchemaService } from '../../page-schema/page-schema.service';
import { BUILTIN_ANTD_RUNTIME_PROFILE } from '../../page-schema/runtime-profiles';

const conformanceFixture = require('../../../../../../test-fixtures/m1a-page-logic-conformance.json');

const manifestModulePath = path.resolve(
  path.dirname(require.resolve('@lowcode-platform/schema-contract')),
  'capabilities/manifest.js',
);
const manifestModule = require(manifestModulePath);

async function withBlockedCapabilityAsync<T>(
  capability: 'page-state' | 'named-computed' | 'action-flow',
  surface: 'contract' | 'validator' | 'editor-agent' | 'renderer' | 'compiler' | 'storage',
  fn: () => Promise<T>,
): Promise<T> {
  const original = manifestModule.getTrustedCapabilityManifest;
  manifestModule.getTrustedCapabilityManifest = () => ({
    manifestVersion: 1,
    matrix: contract.createTestCapabilityMatrix({
      [capability]: { [surface]: { status: 'unsupported', revision: 1 } },
    }),
  });
  try {
    return await fn();
  } finally {
    manifestModule.getTrustedCapabilityManifest = original;
  }
}

describe('Compiler Ingress Capability Gates (C3b / Issue #47)', () => {
  let compilerService: CompilerService;
  let pageSchemaServiceMock: jest.Mocked<Pick<PageSchemaService, 'getSchema'>>;

  beforeEach(() => {
    pageSchemaServiceMock = {
      getSchema: jest.fn().mockResolvedValue({
        pageId: 'test-page-1',
        pageVersion: 1,
        snapshotId: 'snap-1',
        savedAt: '2026-03-20T00:00:00.000Z',
        schema: conformanceFixture.schema,
        runtimeCompatibility: BUILTIN_ANTD_RUNTIME_PROFILE,
      }),
    };

    compilerService = new CompilerService(pageSchemaServiceMock as unknown as PageSchemaService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('8. CompilerService.compile', () => {
    it('rejects blocked schema via real generator/evaluator pipeline with no successful code response and preserves capability issues', async () => {
      await withBlockedCapabilityAsync('page-state', 'compiler', async () => {
        let caughtError: unknown;
        try {
          await compilerService.compile({
            schema: conformanceFixture.schema,
            options: {
              pageId: 'test-page-1',
              pageVersion: 1,
            },
          });
        } catch (error) {
          caughtError = error;
        }

        expect(caughtError).toBeInstanceOf(BadRequestException);
        const badRequest = caughtError as BadRequestException;
        expect(badRequest.getStatus()).toBe(400);

        const response = badRequest.getResponse() as {
          message: string;
          issues?: Array<{ code: string; path: string[]; message: string }>;
        };

        expect(response.message).toContain('Schema validation failed');
        expect(response.issues).toBeDefined();
        expect(response.issues!.length).toBeGreaterThan(0);
        expect(response.issues![0].code).toBe('CAPABILITY_UNSUPPORTED');
        expect(response.issues![0].path).toEqual(['logic', 'states']);
        expect(response.issues![0].message).toContain('compiler');
      });
    });

    it('compiles supported schema with trusted bindings from page snapshot normally', async () => {
      const result = await compilerService.compile({
        schema: conformanceFixture.schema,
        options: {
          pageId: 'test-page-1',
          pageVersion: 1,
        },
      });

      expect(result).toBeDefined();
      expect(typeof result.code).toBe('string');
      expect(typeof result.formatted).toBe('string');
      expect(result.code).toContain('export default function');
      expect(result.code).toContain('recordSource');
      expect(result.code).toContain('submitOrder');
      expect(pageSchemaServiceMock.getSchema).toHaveBeenCalledWith('test-page-1', 1);
    });

    it('compiles legacy schema without logic normally even when logic capability is blocked', async () => {
      pageSchemaServiceMock.getSchema.mockResolvedValueOnce({
        pageId: 'test-legacy-1',
        pageVersion: 1,
        snapshotId: 'snap-legacy-1',
        savedAt: '2026-03-20T00:00:00.000Z',
        schema: conformanceFixture.legacySchema,
        runtimeCompatibility: BUILTIN_ANTD_RUNTIME_PROFILE,
      });

      await withBlockedCapabilityAsync('page-state', 'compiler', async () => {
        const result = await compilerService.compile({
          schema: conformanceFixture.legacySchema,
          options: {
            pageId: 'test-legacy-1',
            pageVersion: 1,
          },
        });

        expect(result).toBeDefined();
        expect(result.code).toContain('export default function');
      });
    });
  });

  describe('9. 直接 compileToCode', () => {
    it('real compileToCode pipeline rejects blocked schema input (non-mocked generator)', async () => {
      await withBlockedCapabilityAsync('action-flow', 'compiler', async () => {
        let caughtError: unknown;
        try {
          compileToCode(conformanceFixture.schema);
        } catch (error) {
          caughtError = error;
        }

        expect(caughtError).toBeInstanceOf(BadRequestException);
        const badRequest = caughtError as BadRequestException;
        const response = badRequest.getResponse() as {
          message: string;
          issues?: Array<{ code: string; path: string[]; message: string }>;
        };

        expect(response.message).toContain('Schema validation failed');
        expect(response.issues).toBeDefined();
        expect(response.issues!.some((i) => i.code === 'CAPABILITY_UNSUPPORTED')).toBe(true);
        expect(response.issues!.some((i) => i.message.includes('action-flow'))).toBe(true);
      });
    });

    it('actual code generation passes syntax and logic inclusion for valid schema', () => {
      const code = compileToCode(conformanceFixture.schema);
      expect(typeof code).toBe('string');
      expect(code).toContain('useState');
      expect(code).toContain('useMemo');
      expect(code).toContain('recordSource');
      expect(code).toContain('submitOrder');
    });
  });
});
