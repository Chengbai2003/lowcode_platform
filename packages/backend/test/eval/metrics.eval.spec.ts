import { computeMetrics } from './metrics';
import type { EvalCaseResult } from './eval-case.types';

const results: EvalCaseResult[] = [
  {
    id: 'valid-schema',
    category: 'draft',
    title: '',
    status: 'passed',
    actual: { schemaValid: true },
    matchesExpected: true,
    mismatches: [],
  },
  {
    id: 'blocked-schema',
    category: 'validation',
    title: '',
    status: 'passed',
    actual: { schemaValid: false, blocked: true },
    matchesExpected: true,
    mismatches: [],
  },
  {
    id: 'safety-not-blocked',
    category: 'safety',
    title: '',
    status: 'failed',
    actual: { blocked: false },
    matchesExpected: false,
    mismatches: ['blocked'],
  },
];

describe('Eval metrics', () => {
  it('derives schema and safety rates from actual outcomes, not expected matches', () => {
    const metrics = computeMetrics(results, []);
    expect(metrics.schemaValidRate).toBe(0.5);
    expect(metrics.safetyBlockRate).toBe(0);
  });

  it('uses null rather than zero for metrics without comparable samples', () => {
    const metrics = computeMetrics([], null);

    expect(metrics.expectedOutcomeRate).toBeNull();
    expect(metrics.replayReproducibility).toBeNull();
  });

  it('keeps infrastructure errors out of the quality denominator', () => {
    const metrics = computeMetrics(
      [
        {
          ...results[0],
          status: 'infra_error',
          matchesExpected: false,
        },
      ],
      [{ id: results[0].id, reproducible: true }],
    );

    expect(metrics.expectedOutcomeRate).toBeNull();
    expect(metrics.replayReproducibility).toBeNull();
  });

  it('requires exactly one replay observation for every comparable Case', () => {
    const partialReplay = computeMetrics(
      [results[0], results[1]],
      [{ id: results[0].id, reproducible: true }],
    );
    const duplicateReplay = computeMetrics(
      [results[0]],
      [
        { id: results[0].id, reproducible: true },
        { id: results[0].id, reproducible: true },
      ],
    );
    const unknownReplay = computeMetrics(
      [results[0]],
      [{ id: 'not-a-result', reproducible: true }],
    );
    const unavailableReplay = computeMetrics([results[0]], null);

    expect(partialReplay.replayReproducibility).toBeNull();
    expect(duplicateReplay.replayReproducibility).toBeNull();
    expect(unknownReplay.replayReproducibility).toBeNull();
    expect(unavailableReplay.replayReproducibility).toBeNull();
  });

  it('does not turn unavailable patch, safety, or conflict results into quality measurements', () => {
    const unavailableResults: EvalCaseResult[] = [
      {
        ...results[0],
        category: 'patch',
        status: 'infra_error',
        actual: {},
        matchesExpected: false,
      },
      {
        ...results[1],
        category: 'safety',
        status: 'infra_error',
        actual: {},
        matchesExpected: false,
      },
      {
        ...results[2],
        category: 'conflict',
        status: 'infra_error',
        actual: {},
        matchesExpected: false,
      },
    ];

    const metrics = computeMetrics(unavailableResults, []);

    expect(metrics).toMatchObject({
      expectedOutcomeRate: null,
      schemaValidRate: null,
      patchMinimality: null,
      safetyBlockRate: null,
      versionConflictIntegrity: null,
    });
  });
});
