import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAndValidateFullSchema, parseAndValidatePageLogic } from '../pageLogicAuthoring';
import type { PageSchema } from '../../../types';

const m1bFixture = JSON.parse(
  readFileSync(
    path.resolve(__dirname, '../../../../../../test-fixtures/m1b-datasource-conformance.json'),
    'utf8',
  ),
);
const m1aFixture = JSON.parse(
  readFileSync(
    path.resolve(__dirname, '../../../../../../test-fixtures/m1a-page-logic-conformance.json'),
    'utf8',
  ),
);

const whitelist = ['Page', 'Text', 'Button'];

describe('Editor JSON/Logic Save Ingress: data-source default-deny (M1b-1 PR A / Refs #64)', () => {
  describe('entrance 6: 编辑器整页 JSON 保存 / Logic 面板保存（生产清单）', () => {
    it('parseAndValidateFullSchema rejects structurally-legal data-source schema with CAPABILITY_UNSUPPORTED', () => {
      const serialized = JSON.stringify(m1bFixture.schema, null, 2);
      const result = parseAndValidateFullSchema(serialized, whitelist);

      expect(result.success).toBe(false);
      if (result.success) return;
      const issues = result.issues ?? [];
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.every((i) => i.code === 'CAPABILITY_UNSUPPORTED')).toBe(true);
      expect(issues.some((i) => i.message.includes('data-source'))).toBe(true);
    });

    it('parseAndValidatePageLogic rejects logic containing dataSources on an existing page', () => {
      const currentSchema = m1bFixture.legacyApiCallSchema as PageSchema;
      const logicJson = JSON.stringify(
        {
          states: { rows: [] },
          dataSources: {
            searchItems: {
              operationRef: { operationId: 'demo.items.search', revision: '1' },
            },
          },
        },
        null,
        2,
      );

      const result = parseAndValidatePageLogic(logicJson, currentSchema, whitelist);
      expect(result.success).toBe(false);
      if (result.success) return;
      const issues = result.issues ?? [];
      expect(issues.some((i) => i.code === 'CAPABILITY_UNSUPPORTED')).toBe(true);
      expect(issues.some((i) => i.message.includes('data-source'))).toBe(true);
    });

    it('regression: M1a conformance schema and plain logic still validate under the production manifest', () => {
      const full = parseAndValidateFullSchema(JSON.stringify(m1aFixture.schema), whitelist);
      expect(full.success).toBe(true);

      const plainLogic = parseAndValidatePageLogic(
        JSON.stringify({ states: { count: 1 } }),
        m1bFixture.legacyApiCallSchema as PageSchema,
        whitelist,
      );
      expect(plainLogic.success).toBe(true);
    });
  });
});
