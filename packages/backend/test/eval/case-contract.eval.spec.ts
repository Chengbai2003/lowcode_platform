import { validateEvalCase } from './case-contract';

const valid = {
  id: 'valid',
  caseSchemaVersion: 1,
  category: 'draft',
  title: 'title',
  intent: 'intent',
  capabilities: ['schema_generation'],
  fixtures: { modelOutputSchema: {} },
  expected: { schemaValid: true },
};

describe('Eval case contract', () => {
  it('rejects unsupported schema versions and empty capabilities', () => {
    expect(() => validateEvalCase({ ...valid, caseSchemaVersion: 2 }, new Set())).toThrow(
      'caseSchemaVersion',
    );
    expect(() => validateEvalCase({ ...valid, capabilities: [] }, new Set())).toThrow(
      'capabilities',
    );
  });

  it('rejects duplicate capabilities and invalid ExpectedOutcome keys', () => {
    expect(() => validateEvalCase({ ...valid, capabilities: ['x', 'x'] }, new Set())).toThrow(
      'capabilities',
    );
    expect(() =>
      validateEvalCase({ ...valid, expected: { unsupported: true } }, new Set()),
    ).toThrow('not supported');
  });
  it('rejects malformed expected values and category fixtures', () => {
    expect(() =>
      validateEvalCase({ ...valid, expected: { schemaValid: 'true' } }, new Set()),
    ).toThrow('boolean');
    expect(() => validateEvalCase({ ...valid, category: 'patch' }, new Set())).toThrow(
      'required fixtures',
    );
    expect(() =>
      validateEvalCase({ ...valid, expected: { riskLevel: 'critical' } }, new Set()),
    ).toThrow('riskLevel');
    expect(() =>
      validateEvalCase({ ...valid, expected: { events: { button: { onClick: {} } } } }, new Set()),
    ).toThrow('action arrays');
  });
});
