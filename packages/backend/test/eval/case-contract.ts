import type { EvalCase, EvalCaseCategory, ExpectedOutcome } from './eval-case.types';

const categories: EvalCaseCategory[] = ['draft', 'patch', 'validation', 'conflict', 'safety'];
const expectedKeys: Array<keyof ExpectedOutcome> = [
  'schemaValid',
  'blocked',
  'blockedReason',
  'normalizedOps',
  'submittedOps',
  'riskLevel',
  'finalVersion',
  'staleBaseConflict',
  'missingBaseConflict',
  'componentIds',
  'componentExists',
  'componentMissing',
  'props',
  'events',
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isStringArray = (value: unknown) =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

export function validateEvalCase(raw: unknown, ids: Set<string>): asserts raw is EvalCase {
  if (!isRecord(raw)) throw new Error('Eval case must be an object');
  const fail = (message: string) => {
    throw new Error(`Eval case ${String(raw.id ?? 'unknown')}: ${message}`);
  };
  if (typeof raw.id !== 'string' || !raw.id.trim() || ids.has(raw.id))
    fail('id must be a unique non-empty string');
  if (typeof raw.title !== 'string' || !raw.title.trim()) fail('title must be a non-empty string');
  if (typeof raw.intent !== 'string' || !raw.intent.trim())
    fail('intent must be a non-empty string');
  if (!categories.includes(raw.category as EvalCaseCategory)) fail('category is invalid');
  if (
    !isStringArray(raw.capabilities) ||
    raw.capabilities.some((item) => !item.trim()) ||
    new Set(raw.capabilities).size !== raw.capabilities.length
  )
    fail('capabilities must be unique non-empty strings');
  if (!isRecord(raw.fixtures)) fail('fixtures are required');
  const fixtures = raw.fixtures as Record<string, unknown>;
  const hasFixtures =
    (raw.category === 'draft' && fixtures.modelOutputSchema !== undefined) ||
    (raw.category === 'patch' &&
      fixtures.baseSchema !== undefined &&
      Array.isArray(fixtures.patch)) ||
    (raw.category === 'validation' &&
      (fixtures.schema !== undefined ||
        fixtures.modelOutputSchema !== undefined ||
        (fixtures.baseSchema !== undefined && Array.isArray(fixtures.patch)))) ||
    (raw.category === 'conflict' &&
      fixtures.baseSchema !== undefined &&
      Array.isArray(fixtures.steps)) ||
    (raw.category === 'safety' &&
      (typeof fixtures.expression === 'string' || fixtures.modelOutputSchema !== undefined));
  if (!hasFixtures) fail('required fixtures are missing');
  if (!isRecord(raw.expected) || Object.keys(raw.expected).length === 0)
    fail('expected outcome is required');
  const expected = raw.expected as Record<string, unknown>;
  for (const [key, value] of Object.entries(expected)) {
    if (!expectedKeys.includes(key as keyof ExpectedOutcome))
      fail(`expected.${key} is not supported`);
    if (
      ['schemaValid', 'blocked', 'staleBaseConflict', 'missingBaseConflict'].includes(key) &&
      typeof value !== 'boolean'
    )
      fail(`expected.${key} must be boolean`);
    if (
      ['normalizedOps', 'submittedOps', 'finalVersion'].includes(key) &&
      (typeof value !== 'number' || !Number.isInteger(value) || value < 0)
    ) {
      fail(`expected.${key} must be a non-negative integer`);
    }
    if (key === 'blockedReason' && (typeof value !== 'string' || !value.trim()))
      fail('expected.blockedReason must be a non-empty string');
    if (key === 'riskLevel' && !['low', 'medium', 'high'].includes(String(value)))
      fail('expected.riskLevel must be low, medium, or high');
    if (
      ['componentIds', 'componentExists', 'componentMissing'].includes(key) &&
      !isStringArray(value)
    )
      fail(`expected.${key} must be string[]`);
    if (
      key === 'props' &&
      (!isRecord(value) || Object.values(value).some((props) => !isRecord(props)))
    )
      fail('expected.props must map component ids to prop objects');
    if (
      key === 'events' &&
      (!isRecord(value) ||
        Object.values(value).some(
          (events) =>
            !isRecord(events) || Object.values(events).some((actions) => !Array.isArray(actions)),
        ))
    )
      fail('expected.events must map component ids and event names to action arrays');
  }
  ids.add(raw.id as string);
}
