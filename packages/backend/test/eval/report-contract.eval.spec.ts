import addFormats from 'ajv-formats';
import Ajv2020 from 'ajv/dist/2020';
import {
  EVAL_RUN_REPORT_JSON_SCHEMA,
  canonicalResults,
  createEvalRunReport,
  toObservedToolCalls,
  type EvalRunReportInput,
} from './report-contract';

interface StrictObjectSchema {
  required: readonly string[];
  properties: Record<string, unknown>;
}

function expectStrictObject(value: object, schema: StrictObjectSchema): void {
  for (const key of schema.required) expect(value).toHaveProperty(key);
  for (const key of Object.keys(value)) expect(schema.properties).toHaveProperty(key);
}

function expectReportMatchesStrictSchema(report: ReturnType<typeof createEvalRunReport>): void {
  const schema = EVAL_RUN_REPORT_JSON_SCHEMA as unknown as {
    required: readonly string[];
    properties: Record<string, unknown>;
    $defs: Record<string, StrictObjectSchema>;
  };
  const rootSchema: StrictObjectSchema = schema;
  expectStrictObject(report, rootSchema);
  expectStrictObject(report.run, schema.$defs.run);
  expectStrictObject(report.environment, schema.$defs.environment);
  expectStrictObject(
    report.environment.contract,
    schema.$defs.environment.properties.contract as StrictObjectSchema,
  );
  if (report.environment.runtimeCompatibility) {
    expectStrictObject(
      report.environment.runtimeCompatibility,
      schema.$defs.environment.properties.runtimeCompatibility as StrictObjectSchema,
    );
  }
  expectStrictObject(
    report.environment.sourceVersions,
    schema.$defs.environment.properties.sourceVersions as StrictObjectSchema,
  );
  expectStrictObject(report.coverage, schema.$defs.coverage);
  expectStrictObject(report.metrics, schema.$defs.metrics);
  for (const result of report.cases) {
    expectStrictObject(result, schema.$defs.case);
    if (result.executionProfile) {
      expectStrictObject(
        result.executionProfile,
        schema.$defs.case.properties.executionProfile as StrictObjectSchema,
      );
    }
    expectStrictObject(result.telemetry, schema.$defs.telemetry);
    if (result.telemetry.toolCalls) {
      for (const toolCall of result.telemetry.toolCalls) {
        expectStrictObject(
          toolCall,
          (schema.$defs.telemetry.properties.toolCalls as { items: StrictObjectSchema }).items,
        );
      }
    }
  }
}

function expectReportMatchesJsonSchema(report: ReturnType<typeof createEvalRunReport>): void {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const valid = ajv.validate(EVAL_RUN_REPORT_JSON_SCHEMA, report);
  if (!valid) {
    throw new Error(`Report v1 JSON Schema validation failed: ${ajv.errorsText(ajv.errors)}`);
  }
}

function expectJsonSchemaRejects(report: unknown): void {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  expect(ajv.validate(EVAL_RUN_REPORT_JSON_SCHEMA, report)).toBe(false);
}

describe('tool-call observability', () => {
  it('keeps an observed empty trace distinct from a missing or malformed trace', () => {
    expect(toObservedToolCalls([])).toEqual([]);
    expect(toObservedToolCalls([{ toolName: 'preview_patch', success: true }])).toEqual([
      { toolName: 'preview_patch', success: true },
    ]);
    expect(toObservedToolCalls([{ toolName: 'preview_patch' }])).toBeNull();
    expect(toObservedToolCalls({ toolName: 'preview_patch', success: true })).toBeNull();
  });
});

function input(overrides: Partial<EvalRunReportInput> = {}): EvalRunReportInput {
  return {
    run: {
      runId: 'run-one',
      mode: 'deterministic',
      generatedAt: '2026-09-03T00:00:00.000Z',
      revision: 'abc123',
      revisionSource: 'local_checkout',
      provider: 'fixture',
      model: null,
      modelSelectionSource: 'fixture',
    },
    environment: {
      contract: {
        packageVersion: '1.0.0',
        packageVersionSource: 'local_checkout',
        pageSchemaVersion: 0,
        evalCaseSchemaVersion: 1,
      },
      runtimeCompatibility: {
        componentPresetId: 'builtin-antd',
        componentPresetVersion: '0.1.0',
        rendererVersion: '1.0.0',
      },
      sourceVersions: {
        prompt: 'fixture-tool-calls-v1',
        tool: 'agent-tool-registry-v1',
        manifest: 'antd-manifest-v1',
        source: 'local_checkout',
      },
    },
    metrics: {
      expectedOutcomeRate: 0.5,
      schemaValidRate: 1,
      patchMinimality: 1,
      safetyBlockRate: null,
      versionConflictIntegrity: null,
      replayReproducibility: 1,
    },
    cases: [
      {
        id: 'passed',
        category: 'patch',
        title: 'passed case',
        status: 'passed',
        executionProfile: {
          replayInstructionVersion: 'fixture-tool-calls-v1',
          policyProfile: 'simple_patch',
        },
        telemetry: {
          latencyMs: 1,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          cost: null,
          toolCalls: [{ toolName: 'update_component_props', success: true }],
          repairCount: 0,
        },
      },
      {
        id: 'failed',
        category: 'draft',
        title: 'failed case',
        status: 'failed',
        mismatchCount: 1,
      },
      {
        id: 'unsupported',
        category: 'safety',
        title: 'unsupported case',
        status: 'unsupported',
      },
      {
        id: 'infra',
        category: 'conflict',
        title: 'infra case',
        status: 'infra_error',
        mismatchCount: 1,
      },
      {
        id: 'not-selected',
        category: 'validation',
        title: 'not selected case',
        status: 'not_selected',
      },
    ],
    ...overrides,
  };
}

describe('Eval Report v1 contract', () => {
  it('publishes a fixed JSON Schema and stable canonical report shape', () => {
    const report = createEvalRunReport(input());

    expect(EVAL_RUN_REPORT_JSON_SCHEMA).toMatchObject({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      properties: { reportVersion: { const: 1 } },
      required: [
        'reportVersion',
        'run',
        'environment',
        'coverage',
        'metrics',
        'cases',
        'resultsDigest',
      ],
    });
    expect(report.cases[0]).not.toHaveProperty('matchesExpected');
    expect(report.cases[1].telemetry.toolCalls).toBeNull();
    expectReportMatchesStrictSchema(report);
    expectReportMatchesJsonSchema(report);
    expect(canonicalResults(report)).toMatchInlineSnapshot(`
{
  "cases": [
    {
      "category": "draft",
      "id": "failed",
      "mismatchCount": 1,
      "status": "failed",
      "title": "failed case",
    },
    {
      "category": "conflict",
      "id": "infra",
      "mismatchCount": 1,
      "status": "infra_error",
      "title": "infra case",
    },
    {
      "category": "validation",
      "id": "not-selected",
      "status": "not_selected",
      "title": "not selected case",
    },
    {
      "category": "patch",
      "executionProfile": {
        "policyProfile": "simple_patch",
        "replayInstructionVersion": "fixture-tool-calls-v1",
      },
      "id": "passed",
      "status": "passed",
      "title": "passed case",
    },
    {
      "category": "safety",
      "id": "unsupported",
      "status": "unsupported",
      "title": "unsupported case",
    },
  ],
  "coverage": {
    "coverageRate": 0.5,
    "executedCases": 2,
    "failedCases": 1,
    "infraErrorCases": 1,
    "notSelectedCases": 1,
    "passedCases": 1,
    "qualityPassRate": 0.5,
    "selectedCases": 4,
    "totalCases": 5,
    "unsupportedCases": 1,
  },
  "environment": {
    "contract": {
      "evalCaseSchemaVersion": 1,
      "packageVersion": "1.0.0",
      "packageVersionSource": "local_checkout",
      "pageSchemaVersion": 0,
    },
    "runtimeCompatibility": {
      "componentPresetId": "builtin-antd",
      "componentPresetVersion": "0.1.0",
      "rendererVersion": "1.0.0",
    },
    "sourceVersions": {
      "manifest": "antd-manifest-v1",
      "prompt": "fixture-tool-calls-v1",
      "source": "local_checkout",
      "tool": "agent-tool-registry-v1",
    },
  },
  "metrics": {
    "expectedOutcomeRate": 0.5,
    "patchMinimality": 1,
    "qualityPassRate": 0.5,
    "replayReproducibility": 1,
    "safetyBlockRate": null,
    "schemaValidRate": 1,
    "versionConflictIntegrity": null,
  },
  "reportVersion": 1,
}
`);
  });

  it('excludes run metadata and telemetry from the canonical digest', () => {
    const first = createEvalRunReport(input());
    const second = createEvalRunReport(
      input({
        run: {
          ...input().run,
          runId: 'run-two',
          generatedAt: '2026-09-03T01:00:00.000Z',
          revision: 'def456',
        },
        cases: input().cases.map((result, index) =>
          index === 0
            ? {
                ...result,
                telemetry: {
                  latencyMs: 999,
                  usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
                  cost: 1.23,
                  toolCalls: [{ toolName: 'different-runtime-tool', success: false }],
                  repairCount: 3,
                },
              }
            : result,
        ),
      }),
    );

    expect(second.resultsDigest).toBe(first.resultsDigest);
  });

  it('uses Case IDs rather than input order when calculating the canonical digest', () => {
    const first = createEvalRunReport(input());
    const reordered = createEvalRunReport(
      input({
        cases: [...input().cases].reverse(),
      }),
    );

    expect(reordered.resultsDigest).toBe(first.resultsDigest);
    expect(canonicalResults(reordered).cases.map((evalCase) => evalCase.id)).toEqual([
      'failed',
      'infra',
      'not-selected',
      'passed',
      'unsupported',
    ]);
  });

  it('changes the digest when canonical status or effective policy profile changes', () => {
    const first = createEvalRunReport(input());
    const changedOutcome = createEvalRunReport(
      input({
        cases: input().cases.map((result, index) =>
          index === 0 ? { ...result, status: 'failed' } : result,
        ),
        metrics: {
          ...input().metrics,
          expectedOutcomeRate: 0,
        },
      }),
    );
    const changedProfile = createEvalRunReport(
      input({
        cases: input().cases.map((result, index) =>
          index === 0
            ? {
                ...result,
                executionProfile: {
                  replayInstructionVersion: 'fixture-tool-calls-v1',
                  policyProfile: 'normal_patch',
                },
              }
            : result,
        ),
      }),
    );

    expect(changedOutcome.resultsDigest).not.toBe(first.resultsDigest);
    expect(changedProfile.resultsDigest).not.toBe(first.resultsDigest);
  });

  it('keeps unsupported and infra errors out of the quality denominator without hiding them', () => {
    const report = createEvalRunReport(input());

    expect(report.coverage).toEqual({
      totalCases: 5,
      selectedCases: 4,
      executedCases: 2,
      passedCases: 1,
      failedCases: 1,
      unsupportedCases: 1,
      infraErrorCases: 1,
      notSelectedCases: 1,
      coverageRate: 0.5,
      qualityPassRate: 0.5,
    });
    expect(report.metrics.qualityPassRate).toBe(0.5);
  });

  it('can publish an infra-error report before runtime metadata is observable', () => {
    const baseline = input();
    const report = createEvalRunReport(
      input({
        run: {
          ...baseline.run,
          mode: 'live',
          revisionSource: 'target_declaration',
          provider: 'openai',
          model: 'target-model',
          modelSelectionSource: 'requested',
        },
        environment: {
          ...baseline.environment,
          contract: {
            ...baseline.environment.contract,
            packageVersionSource: 'target_declaration',
            pageSchemaVersion: null,
          },
          runtimeCompatibility: null,
          sourceVersions: {
            ...baseline.environment.sourceVersions,
            manifest: 'unavailable',
            source: 'target_declaration',
          },
        },
        cases: [
          {
            id: 'runtime-unavailable',
            category: 'patch',
            title: 'runtime unavailable',
            status: 'infra_error',
            mismatchCount: 1,
          },
        ],
        metrics: {
          ...baseline.metrics,
          expectedOutcomeRate: null,
        },
      }),
    );

    expect(report.coverage).toMatchObject({ infraErrorCases: 1, coverageRate: 0 });
    expect(report.environment.runtimeCompatibility).toBeNull();
    expectReportMatchesStrictSchema(report);
    expectReportMatchesJsonSchema(report);
  });

  it('rejects unavailable runtime metadata without a live infrastructure error', () => {
    const baseline = input();
    expect(() =>
      createEvalRunReport(
        input({
          run: {
            ...baseline.run,
            mode: 'live',
            revisionSource: 'target_declaration',
            provider: 'openai',
            model: 'target-model',
            modelSelectionSource: 'requested',
          },
          environment: {
            ...baseline.environment,
            contract: {
              ...baseline.environment.contract,
              packageVersionSource: 'target_declaration',
              pageSchemaVersion: null,
            },
            runtimeCompatibility: null,
            sourceVersions: {
              ...baseline.environment.sourceVersions,
              source: 'target_declaration',
            },
          },
          cases: [
            {
              id: 'unsupported-before-runtime',
              category: 'safety',
              title: 'unsupported before runtime',
              status: 'unsupported',
            },
          ],
        }),
      ),
    ).toThrow('runtime metadata can be unavailable only when a live run has an infra_error');
  });

  it('rejects unavailable runtime metadata once a live Case has executed', () => {
    const baseline = input();
    expect(() =>
      createEvalRunReport(
        input({
          run: {
            ...baseline.run,
            mode: 'live',
            revisionSource: 'target_declaration',
            provider: 'openai',
            model: 'target-model',
            modelSelectionSource: 'requested',
          },
          environment: {
            ...baseline.environment,
            contract: {
              ...baseline.environment.contract,
              packageVersionSource: 'target_declaration',
              pageSchemaVersion: null,
            },
            runtimeCompatibility: null,
            sourceVersions: {
              ...baseline.environment.sourceVersions,
              source: 'target_declaration',
            },
          },
          cases: [
            {
              id: 'runtime-unavailable',
              category: 'patch',
              title: 'runtime unavailable',
              status: 'infra_error',
            },
            {
              id: 'executed-without-runtime',
              category: 'patch',
              title: 'executed without runtime',
              status: 'passed',
            },
          ],
          metrics: {
            ...baseline.metrics,
            expectedOutcomeRate: 1,
          },
        }),
      ),
    ).toThrow('runtime metadata can be unavailable when a live run has executed Cases');
  });

  it('encodes source and runtime availability invariants in the published JSON Schema', () => {
    const invalidLiveSources = structuredClone(createEvalRunReport(input()));
    invalidLiveSources.run.mode = 'live';
    expectJsonSchemaRejects(invalidLiveSources);

    const unavailableWithoutInfraError = structuredClone(createEvalRunReport(input()));
    unavailableWithoutInfraError.environment.runtimeCompatibility = null;
    unavailableWithoutInfraError.environment.contract.pageSchemaVersion = null;
    const casesWithoutInfraError = unavailableWithoutInfraError.cases.map((evalCase) =>
      evalCase.status === 'infra_error'
        ? { ...evalCase, status: 'unsupported' as const }
        : evalCase,
    );
    expectJsonSchemaRejects({ ...unavailableWithoutInfraError, cases: casesWithoutInfraError });

    const liveReport = createEvalRunReport(
      input({
        run: {
          ...input().run,
          mode: 'live',
          revisionSource: 'target_declaration',
          provider: 'openai',
          model: 'target-model',
          modelSelectionSource: 'requested',
        },
        environment: {
          ...input().environment,
          contract: {
            ...input().environment.contract,
            packageVersionSource: 'target_declaration',
          },
          sourceVersions: {
            ...input().environment.sourceVersions,
            source: 'target_declaration',
          },
        },
      }),
    );
    const unavailableWithExecutedCase = structuredClone(liveReport);
    unavailableWithExecutedCase.environment.runtimeCompatibility = null;
    unavailableWithExecutedCase.environment.contract.pageSchemaVersion = null;
    expectJsonSchemaRejects(unavailableWithExecutedCase);
    expectJsonSchemaRejects({ ...liveReport, run: { ...liveReport.run, provider: '' } });
    expectJsonSchemaRejects({ ...liveReport, run: { ...liveReport.run, model: null } });
  });

  it('whitelists report fields and rejects malformed public values', () => {
    const unsafe = input();
    (unsafe.run as typeof unsafe.run & { apiKey: string }).apiKey = 'run-secret';
    (unsafe.environment as typeof unsafe.environment & { authorization: string }).authorization =
      'environment-secret';
    (unsafe.metrics as typeof unsafe.metrics & { debug: string }).debug = 'metrics-secret';
    const telemetry = unsafe.cases[0].telemetry as NonNullable<
      (typeof unsafe.cases)[0]['telemetry']
    > & {
      apiKey: string;
    };
    telemetry.apiKey = 'telemetry-secret';

    const unsafeCases = unsafe.cases.map((result, index) =>
      index === 0
        ? {
            ...result,
            actual: { apiKey: 'actual-secret', toolInput: 'tool-input-secret' },
            mismatches: ['token-secret'],
          }
        : result,
    );

    const report = createEvalRunReport({ ...unsafe, cases: unsafeCases });
    expect(JSON.stringify(report)).not.toContain('secret');
    expect(report.cases[0]).toMatchObject({ mismatchCount: 1 });
    expect(report.cases[0]).not.toHaveProperty('actual');
    expect(report.cases[0]).not.toHaveProperty('mismatches');
    expectReportMatchesStrictSchema(report);

    const baseline = input();
    expect(() =>
      createEvalRunReport(
        input({
          environment: {
            ...baseline.environment,
            runtimeCompatibility: {} as unknown as typeof baseline.environment.runtimeCompatibility,
          },
        }),
      ),
    ).toThrow('environment.runtimeCompatibility.componentPresetId');

    const invalidMetrics = input();
    invalidMetrics.metrics.expectedOutcomeRate = 1.1;
    expect(() => createEvalRunReport(invalidMetrics)).toThrow('metrics.expectedOutcomeRate');

    const inconsistentExpectedOutcomeRate = input();
    inconsistentExpectedOutcomeRate.metrics.expectedOutcomeRate = 0;
    expect(() => createEvalRunReport(inconsistentExpectedOutcomeRate)).toThrow(
      'metrics.expectedOutcomeRate must equal the case-derived qualityPassRate',
    );

    const duplicateCaseIds = input();
    duplicateCaseIds.cases = [
      duplicateCaseIds.cases[0],
      { ...duplicateCaseIds.cases[1], id: duplicateCaseIds.cases[0].id },
    ];
    expect(() => createEvalRunReport(duplicateCaseIds)).toThrow('Duplicate Eval case id');

    const invalidGeneratedAt = input();
    invalidGeneratedAt.run.generatedAt = '2026-09-03';
    expect(() => createEvalRunReport(invalidGeneratedAt)).toThrow('run.generatedAt');

    const impossibleGeneratedAt = input();
    impossibleGeneratedAt.run.generatedAt = '2026-02-31T00:00:00Z';
    expect(() => createEvalRunReport(impossibleGeneratedAt)).toThrow('run.generatedAt');

    const nonCanonicalGeneratedAt = input();
    nonCanonicalGeneratedAt.run.generatedAt = '2026-12-31t23:59:59z';
    expect(() => createEvalRunReport(nonCanonicalGeneratedAt)).toThrow('run.generatedAt');

    const leapSecondGeneratedAt = input();
    leapSecondGeneratedAt.run.generatedAt = '2026-12-31T23:59:60Z';
    expect(() => createEvalRunReport(leapSecondGeneratedAt)).toThrow('run.generatedAt');

    const offsetGeneratedAt = input();
    offsetGeneratedAt.run.generatedAt = '2024-02-29T23:59:59+05:30';
    expectReportMatchesJsonSchema(createEvalRunReport(offsetGeneratedAt));

    const unsafeTelemetryInteger = input({
      cases: input().cases.map((evalCase, index) =>
        index === 0
          ? {
              ...evalCase,
              telemetry: {
                ...evalCase.telemetry!,
                repairCount: Number.MAX_SAFE_INTEGER + 1,
              },
            }
          : evalCase,
      ),
    });
    expect(() => createEvalRunReport(unsafeTelemetryInteger)).toThrow('telemetry.repairCount');

    const unsafeEvalCaseSchemaVersion = input({
      environment: {
        ...baseline.environment,
        contract: {
          ...baseline.environment.contract,
          evalCaseSchemaVersion: Number.MAX_SAFE_INTEGER + 1,
        },
      },
    });
    expect(() => createEvalRunReport(unsafeEvalCaseSchemaVersion)).toThrow(
      'environment.contract.evalCaseSchemaVersion',
    );

    const inconsistentSource = input();
    inconsistentSource.run.revisionSource = 'target_declaration';
    expect(() => createEvalRunReport(inconsistentSource)).toThrow('run.revisionSource');

    const missingLiveModel = input({
      run: {
        ...baseline.run,
        mode: 'live',
        revisionSource: 'target_declaration',
        provider: 'openai',
        model: null,
        modelSelectionSource: 'requested',
      },
      environment: {
        ...baseline.environment,
        contract: {
          ...baseline.environment.contract,
          packageVersionSource: 'target_declaration',
        },
        sourceVersions: {
          ...baseline.environment.sourceVersions,
          source: 'target_declaration',
        },
      },
    });
    expect(() => createEvalRunReport(missingLiveModel)).toThrow(
      'run.provider and run.model must be recorded for live',
    );

    const invalidDateInPublishedJson = structuredClone(createEvalRunReport(input()));
    invalidDateInPublishedJson.run.generatedAt = '2026-02-31T00:00:00Z';
    expectJsonSchemaRejects(invalidDateInPublishedJson);

    const nonCanonicalDateInPublishedJson = structuredClone(createEvalRunReport(input()));
    nonCanonicalDateInPublishedJson.run.generatedAt = '2026-12-31t23:59:59z';
    expectJsonSchemaRejects(nonCanonicalDateInPublishedJson);

    const leapSecondInPublishedJson = structuredClone(createEvalRunReport(input()));
    leapSecondInPublishedJson.run.generatedAt = '2026-12-31T23:59:60Z';
    expectJsonSchemaRejects(leapSecondInPublishedJson);

    const unsafeIntegerInPublishedJson = structuredClone(createEvalRunReport(input()));
    unsafeIntegerInPublishedJson.cases[0].telemetry.repairCount = Number.MAX_SAFE_INTEGER + 1;
    expectJsonSchemaRejects(unsafeIntegerInPublishedJson);
  });
});
