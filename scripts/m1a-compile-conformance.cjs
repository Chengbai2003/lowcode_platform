#!/usr/bin/env node

/**
 * M1a Conformance Compilation Bridge
 *
 * Invokes the real backend compileToCode generator to compile conformance fixture schemas.
 * Used exclusively by test harnesses (e.g. Renderer.compiler-parity.test.tsx) via child process.
 * Renderer production code never imports or depends on backend or this script.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const repoRoot = path.resolve(__dirname, '..');
const fixturePath = path.resolve(repoRoot, 'test-fixtures/m1a-page-logic-conformance.json');
const backendPackageJson = path.resolve(repoRoot, 'packages/backend/package.json');
const backendTsConfig = path.resolve(repoRoot, 'packages/backend/tsconfig.json');

function main() {
  const args = process.argv.slice(2);
  let caseArg = 'all';

  for (const arg of args) {
    if (arg === '--cases=all') {
      caseArg = 'all';
    } else if (arg.startsWith('--case=')) {
      caseArg = arg.slice('--case='.length);
    }
  }

  if (!fs.existsSync(fixturePath)) {
    console.error(`Conformance fixture not found at ${fixturePath}`);
    process.exit(1);
  }

  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

  const backendRequire = createRequire(backendPackageJson);
  const tsNode = backendRequire('ts-node');
  tsNode.register({
    project: backendTsConfig,
    transpileOnly: true,
  });

  const { compileToCode } = backendRequire('./src/modules/compiler/generator');

  const knownCases = {
    main: () => compileToCode(fixture.schema),
    legacy: () => compileToCode(fixture.legacySchema),
    edge: () => compileToCode(fixture.edgeSchema),
    actionBudget: () =>
      compileToCode(fixture.budgetExceededCases.actionBudget.schema, {
        flowExecutionLimits: fixture.smallLimits,
      }),
    iterationBudget: () =>
      compileToCode(fixture.budgetExceededCases.iterationBudget.schema, {
        flowExecutionLimits: fixture.smallLimits,
      }),
    depthBudget: () =>
      compileToCode(fixture.budgetExceededCases.depthBudget.schema, {
        flowExecutionLimits: fixture.smallLimits,
      }),
    durationBudget: () =>
      compileToCode(fixture.budgetExceededCases.durationBudget.schema, {
        flowExecutionLimits: fixture.smallLimits,
      }),
    concurrencyBudget: () =>
      compileToCode(fixture.budgetExceededCases.concurrencyBudget.schema, {
        flowExecutionLimits: fixture.smallLimits,
      }),
  };

  const results = {};

  if (caseArg === 'all') {
    for (const [key, compileFn] of Object.entries(knownCases)) {
      results[key] = compileFn();
    }
  } else if (knownCases[caseArg]) {
    results[caseArg] = knownCases[caseArg]();
  } else {
    console.error(`Unknown case "${caseArg}". Known cases: ${Object.keys(knownCases).join(', ')}`);
    process.exit(1);
  }

  process.stdout.write(JSON.stringify(results));
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exit(1);
}
