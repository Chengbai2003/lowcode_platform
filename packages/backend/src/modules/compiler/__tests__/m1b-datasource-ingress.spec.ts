import { BadRequestException } from '@nestjs/common';
import { CompilerService } from '../compiler.service';
import { compileToCode } from '../generator';
import { PageSchemaService } from '../../page-schema/page-schema.service';
import { BUILTIN_ANTD_RUNTIME_PROFILE } from '../../page-schema/runtime-profiles';

const m1bFixture = require('../../../../../../test-fixtures/m1b-datasource-conformance.json');
const m1aFixture = require('../../../../../../test-fixtures/m1a-page-logic-conformance.json');

describe('Compiler Ingress: data-source default-deny (M1b-1 PR A / Refs #64)', () => {
  let compilerService: CompilerService;
  let pageSchemaServiceMock: jest.Mocked<Pick<PageSchemaService, 'getSchema'>>;

  beforeEach(() => {
    pageSchemaServiceMock = {
      getSchema: jest.fn().mockResolvedValue({
        pageId: 'm1b-page-1',
        pageVersion: 1,
        snapshotId: 'snap-1',
        savedAt: '2026-09-18T00:00:00.000Z',
        schema: m1bFixture.schema,
        runtimeCompatibility: BUILTIN_ANTD_RUNTIME_PROFILE,
      }),
    };

    compilerService = new CompilerService(pageSchemaServiceMock as unknown as PageSchemaService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('entrance 8a: CompilerService.compile（生产清单）', () => {
    it('rejects data-source schema with 400 CAPABILITY_UNSUPPORTED before any code generation', async () => {
      let caughtError: unknown;
      try {
        await compilerService.compile({
          schema: m1bFixture.schema,
          options: { pageId: 'm1b-page-1', pageVersion: 1 },
        });
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError).toBeInstanceOf(BadRequestException);
      const badRequest = caughtError as BadRequestException;
      expect(badRequest.getStatus()).toBe(400);

      const response = badRequest.getResponse() as {
        message: string;
        issues: Array<{ code: string; path: string[]; message: string }>;
      };
      expect(response.issues.length).toBeGreaterThan(0);
      expect(
        response.issues.some(
          (i) => i.code === 'CAPABILITY_UNSUPPORTED' && i.message.includes('data-source'),
        ),
      ).toBe(true);
    });

    it('regression: M1a conformance schema still compiles under the production manifest', async () => {
      const result = await compilerService.compile({
        schema: m1aFixture.schema,
        options: { pageId: 'm1a-page-1', pageVersion: 1 },
      });
      expect(typeof result.code).toBe('string');
      expect(result.code.length).toBeGreaterThan(0);
    });
  });

  describe('entrance 8b: compileToCode 直接编译（生产清单）', () => {
    it('rejects data-source schema with SchemaValidationError CAPABILITY_UNSUPPORTED (both event & flow placements)', () => {
      for (const schema of [m1bFixture.schema, m1bFixture.flowSchema]) {
        let caughtError: unknown;
        try {
          compileToCode(
            schema as never,
            {
              compilerBindingId: 'builtin-antd',
            } as never,
          );
        } catch (err) {
          caughtError = err;
        }

        // 后端 requireValidPageSchema 包装层将 SchemaValidationError 映射为 400
        expect(caughtError).toBeInstanceOf(BadRequestException);
        const message = (caughtError as Error).message;
        expect(message).toContain('data-source');
        expect(message).toContain('is unsupported by consumer surface');
        for (const surface of [
          'contract',
          'validator',
          'editor-agent',
          'renderer',
          'compiler',
          'storage',
        ]) {
          expect(message).toContain(surface);
        }
      }
    });
  });
});
