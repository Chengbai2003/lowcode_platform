import { computeMetrics } from './metrics';
import type { EvalCase, EvalCaseResult } from './eval-case.types';

const cases: EvalCase[] = [
  {
    id: 'valid-schema',
    caseSchemaVersion: 1,
    category: 'draft',
    title: 'valid schema',
    capabilities: ['schema_validation'],
    intent: '',
    fixtures: { modelOutputSchema: {} },
    expected: { schemaValid: true },
  },
  {
    id: 'blocked-schema',
    caseSchemaVersion: 1,
    category: 'validation',
    title: 'blocked schema',
    capabilities: ['schema_validation'],
    intent: '',
    fixtures: { schema: {} },
    expected: { schemaValid: false, blocked: true },
  },
  {
    id: 'safety-not-blocked',
    caseSchemaVersion: 1,
    category: 'safety',
    title: 'safety not blocked',
    capabilities: ['security_validation'],
    intent: '',
    fixtures: { expression: 'true' },
    expected: { blocked: true },
  },
];

const results: EvalCaseResult[] = [
  {
    id: 'valid-schema',
    category: 'draft',
    title: '',
    actual: { schemaValid: true },
    matchesExpected: true,
    mismatches: [],
  },
  {
    id: 'blocked-schema',
    category: 'validation',
    title: '',
    actual: { schemaValid: false, blocked: true },
    matchesExpected: true,
    mismatches: [],
  },
  {
    id: 'safety-not-blocked',
    category: 'safety',
    title: '',
    actual: { blocked: false },
    matchesExpected: false,
    mismatches: ['blocked'],
  },
];

describe('Eval metrics', () => {
  it('derives schema and safety rates from actual outcomes, not expected matches', () => {
    const metrics = computeMetrics(cases, results, []);
    expect(metrics.schemaValidRate).toBe(0.5);
    expect(metrics.safetyBlockRate).toBe(0);
  });
});
