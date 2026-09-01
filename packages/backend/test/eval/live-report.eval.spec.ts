// eslint-disable-next-line @typescript-eslint/no-var-requires
const { summarizeLiveResults } = require('./live-report.cjs') as {
  summarizeLiveResults: (results: Array<Record<string, unknown>>) => Record<string, unknown>;
};

describe('Live Eval report summary', () => {
  it('reports skipped coverage separately from first-pass success', () => {
    expect(
      summarizeLiveResults([
        ...Array.from({ length: 17 }, (_, index) => ({
          id: `run-${index}`,
          skipped: false,
          firstPassSuccess: true,
          latencyMs: 10,
        })),
        ...Array.from({ length: 3 }, (_, index) => ({ id: `skip-${index}`, skipped: true })),
      ]),
    ).toMatchObject({
      totalCases: 20,
      executedCases: 17,
      skippedCases: 3,
      coverageRate: 0.85,
      firstPassSuccessRate: 1,
    });
  });
});
