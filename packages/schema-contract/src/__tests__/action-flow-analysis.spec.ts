import { describe, expect, it } from 'vitest';
import { analyzeActionFlowDeclarations, validatePageSchemaValue } from '../index';

describe('ActionFlow Contract and Migration Boundary (M1a-2 / F1)', () => {
  it('1. accepts a single valid Flow declaration and produces topology', () => {
    const result = analyzeActionFlowDeclarations({
      submit: {
        steps: [{ type: 'log', value: 'hello' }],
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.order).toEqual(['submit']);
    expect(result.value.nodes).toHaveLength(1);
    expect(result.value.nodes[0].key).toBe('submit');
    expect(result.value.nodes[0].flowDependencies).toEqual([]);
  });

  it('2. orders dependencies first when Flow A calls Flow B', () => {
    const result = analyzeActionFlowDeclarations({
      flowA: {
        steps: [{ type: 'runFlow', flow: 'flowB' }],
      },
      flowB: {
        steps: [{ type: 'log', value: 'b' }],
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.order).toEqual(['flowB', 'flowA']);
    expect(result.value.nodes.map((n) => n.key)).toEqual(['flowB', 'flowA']);
    const nodeA = result.value.nodes.find((n) => n.key === 'flowA')!;
    expect(nodeA.flowDependencies).toEqual(['flowB']);
  });

  it('3. collects runFlow references in nested if, loop, and onError branches', () => {
    const result = analyzeActionFlowDeclarations({
      main: {
        steps: [
          {
            type: 'if',
            condition: true,
            then: [{ type: 'runFlow', flow: 'branchA' }],
            else: [{ type: 'runFlow', flow: 'branchB' }],
          },
          {
            type: 'loop',
            over: [1, 2],
            itemVar: 'item',
            actions: [{ type: 'runFlow', flow: 'branchC' }],
          },
        ],
        onError: [{ type: 'runFlow', flow: 'errorHandler' }],
      },
      branchA: { steps: [{ type: 'log', value: 'a' }] },
      branchB: { steps: [{ type: 'log', value: 'b' }] },
      branchC: { steps: [{ type: 'log', value: 'c' }] },
      errorHandler: { steps: [{ type: 'log', value: 'err' }] },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const mainNode = result.value.nodes.find((n) => n.key === 'main')!;
    expect(mainNode.flowDependencies).toEqual(['branchA', 'branchB', 'branchC', 'errorHandler']);
    expect(result.value.order.indexOf('branchA')).toBeLessThan(result.value.order.indexOf('main'));
    expect(result.value.order.indexOf('branchB')).toBeLessThan(result.value.order.indexOf('main'));
    expect(result.value.order.indexOf('branchC')).toBeLessThan(result.value.order.indexOf('main'));
    expect(result.value.order.indexOf('errorHandler')).toBeLessThan(
      result.value.order.indexOf('main'),
    );
  });

  it('4. fails close when runFlow references a non-existent Flow', () => {
    const result = analyzeActionFlowDeclarations({
      submit: {
        steps: [
          { type: 'log', value: 'start' },
          { type: 'runFlow', flow: 'nonExistentFlow' },
        ],
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'FLOW_REFERENCE_MISSING',
        path: ['logic', 'flows', 'submit', 'steps', 1, 'flow'],
      }),
    ]);
  });

  it('5. fails close with FLOW_REFERENCE_CYCLE on a self-looping Flow', () => {
    const result = analyzeActionFlowDeclarations({
      submit: {
        steps: [{ type: 'runFlow', flow: 'submit' }],
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'FLOW_REFERENCE_CYCLE',
        path: ['logic', 'flows', 'submit'],
      }),
    ]);
  });

  it('6. fails close with FLOW_REFERENCE_CYCLE on cross-node cycle A -> B -> A', () => {
    const result = analyzeActionFlowDeclarations({
      flowA: {
        steps: [{ type: 'runFlow', flow: 'flowB' }],
      },
      flowB: {
        steps: [{ type: 'runFlow', flow: 'flowA' }],
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const cycleIssues = result.issues.filter((i) => i.code === 'FLOW_REFERENCE_CYCLE');
    expect(cycleIssues.length).toBe(2);
    const paths = cycleIssues.map((i) => i.path.join('.'));
    expect(paths).toContain('logic.flows.flowA');
    expect(paths).toContain('logic.flows.flowB');
  });

  it('7. fails close on invalid Flow Key syntax or dangerous prototype keys', () => {
    const result = analyzeActionFlowDeclarations({
      'invalid-key': {
        steps: [{ type: 'log', value: 'hi' }],
      },
      constructor: {
        steps: [{ type: 'log', value: 'hi' }],
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.issues.some((i) => i.code === 'INVALID_FLOW_KEY' && i.path.includes('invalid-key')),
    ).toBe(true);
    expect(
      result.issues.some((i) => i.code === 'INVALID_FLOW_KEY' && i.path.includes('constructor')),
    ).toBe(true);
  });

  it('8. fails close on unknown fields on an ActionFlow object', () => {
    const result = analyzeActionFlowDeclarations({
      submit: {
        steps: [{ type: 'log', value: 'hi' }],
        unknownProp: 123,
      } as any,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'UNKNOWN_FLOW_FIELD',
        path: ['logic', 'flows', 'submit', 'unknownProp'],
      }),
    ]);
  });

  it('9. fails close on unknown Action or Step type', () => {
    const result = analyzeActionFlowDeclarations({
      submit: {
        steps: [{ type: 'unknownStepType' } as any],
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'UNSUPPORTED_ACTION_TYPE',
        path: ['logic', 'flows', 'submit', 'steps', 0, 'type'],
      }),
    ]);
  });

  it('10. fails close on missing or empty steps array', () => {
    const resultEmpty = analyzeActionFlowDeclarations({
      submit: {
        steps: [],
      },
    });
    expect(resultEmpty.ok).toBe(false);
    if (resultEmpty.ok) return;
    expect(resultEmpty.issues).toEqual([
      expect.objectContaining({
        code: 'FLOW_STEPS_REQUIRED',
        path: ['logic', 'flows', 'submit', 'steps'],
      }),
    ]);

    const resultMissing = analyzeActionFlowDeclarations({
      submit: {} as any,
    });
    expect(resultMissing.ok).toBe(false);
    if (resultMissing.ok) return;
    expect(resultMissing.issues).toEqual([
      expect.objectContaining({
        code: 'FLOW_STEPS_REQUIRED',
        path: ['logic', 'flows', 'submit', 'steps'],
      }),
    ]);
  });

  it('11. fails close on empty onError array', () => {
    const result = analyzeActionFlowDeclarations({
      submit: {
        steps: [{ type: 'log', value: 'hi' }],
        onError: [],
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'INVALID_FLOW_ON_ERROR',
        path: ['logic', 'flows', 'submit', 'onError'],
      }),
    ]);
  });

  it('12. fails close when Flow declaration count exceeds maxFlowEntries', () => {
    const flows: Record<string, any> = {};
    for (let i = 0; i < 5; i++) {
      flows[`flow_${i}`] = { steps: [{ type: 'log', value: i }] };
    }
    const result = analyzeActionFlowDeclarations(flows, { maxFlowEntries: 4 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'FLOW_ENTRIES_BUDGET_EXCEEDED',
        path: ['logic', 'flows'],
      }),
    ]);
  });

  it('13. shares maxActionNodes across all flows and prevents resetting per flow', () => {
    const result = analyzeActionFlowDeclarations(
      {
        flowA: {
          steps: [
            { type: 'log', value: 1 },
            { type: 'log', value: 2 },
          ],
        },
        flowB: {
          steps: [
            { type: 'log', value: 3 },
            { type: 'log', value: 4 },
          ],
        },
      },
      { maxActionNodes: 3 },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((i) => i.code === 'ACTION_BUDGET_EXCEEDED')).toBe(true);
  });

  it('14. fails close with ACTION_DEPTH_EXCEEDED when Flow reference chain exceeds maxActionDepth', () => {
    const result = analyzeActionFlowDeclarations(
      {
        flowA: { steps: [{ type: 'runFlow', flow: 'flowB' }] },
        flowB: { steps: [{ type: 'runFlow', flow: 'flowC' }] },
        flowC: { steps: [{ type: 'runFlow', flow: 'flowD' }] },
        flowD: { steps: [{ type: 'log', value: 'leaf' }] },
      },
      { maxActionDepth: 3 },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'ACTION_DEPTH_EXCEEDED',
        path: ['logic', 'flows', 'flowA'],
      }),
    ]);
  });

  it('15. rejects getters, non-plain prototypes, and symbols without executing getters', () => {
    let getterRan = false;
    const dangerousObj = Object.create(null);
    Object.defineProperty(dangerousObj, 'poison', {
      enumerable: true,
      get() {
        getterRan = true;
        return { steps: [{ type: 'log', value: 'hi' }] };
      },
    });

    const resultGetter = analyzeActionFlowDeclarations(dangerousObj);
    expect(resultGetter.ok).toBe(false);
    expect(getterRan).toBe(false);
    if (!resultGetter.ok) {
      expect(resultGetter.issues.some((i) => i.code === 'ACCESSOR_PROPERTY_FORBIDDEN')).toBe(true);
    }

    const badProto = Object.create({ inherited: true });
    const resultProto = analyzeActionFlowDeclarations(badProto);
    expect(resultProto.ok).toBe(false);
    if (!resultProto.ok) {
      expect(resultProto.issues.some((i) => i.code === 'INVALID_OBJECT_PROTOTYPE')).toBe(true);
    }

    const sym = Symbol('dangerous');
    const symObj = {
      [sym]: { steps: [{ type: 'log', value: 'hi' }] },
    };
    const resultSym = analyzeActionFlowDeclarations(symObj);
    expect(resultSym.ok).toBe(false);
    if (!resultSym.ok) {
      expect(resultSym.issues.some((i) => i.code === 'SYMBOL_PROPERTY_FORBIDDEN')).toBe(true);
    }
  });

  it('16. produces deterministically sorted and deep-frozen analysis output', () => {
    const result = analyzeActionFlowDeclarations({
      zFlow: { steps: [{ type: 'log', value: 'z' }] },
      aFlow: { steps: [{ type: 'log', value: 'a' }] },
      mFlow: { steps: [{ type: 'runFlow', flow: 'zFlow' }] },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.order).toEqual(['aFlow', 'zFlow', 'mFlow']);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.nodes)).toBe(true);
    expect(Object.isFrozen(result.value.nodes[0])).toBe(true);
    expect(Object.isFrozen(result.value.flows)).toBe(true);
  });

  it('17. continues to accept legacy inline ActionList in PageSchema', () => {
    const schema = {
      schemaVersion: 0,
      rootId: 'root',
      components: {
        root: {
          id: 'root',
          type: 'Button',
          events: {
            onClick: [
              { type: 'setValue', field: 'state.count', value: 1 },
              { type: 'delay', ms: 100 },
            ],
          },
        },
      },
    };
    const result = validatePageSchemaValue(schema);
    expect(result.ok).toBe(true);
  });

  it('18. fails close when logic.flows is passed to default PageSchema validator', () => {
    const schema = {
      schemaVersion: 0,
      rootId: 'root',
      components: {
        root: {
          id: 'root',
          type: 'Button',
        },
      },
      logic: {
        flows: {
          submit: {
            steps: [{ type: 'log', value: 'hi' }],
          },
        },
      },
    };
    const result = validatePageSchemaValue(schema);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'UNKNOWN_LOGIC_FIELD',
        path: ['logic', 'flows'],
      }),
    ]);
  });

  it('19. fails close when runFlow is used directly in component events', () => {
    const schema = {
      schemaVersion: 0,
      rootId: 'root',
      components: {
        root: {
          id: 'root',
          type: 'Button',
          events: {
            onClick: [{ type: 'runFlow', flow: 'submit' }],
          },
        },
      },
    };
    const result = validatePageSchemaValue(schema);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'UNSUPPORTED_ACTION_TYPE',
        path: ['components', 'root', 'events', 'onClick', 0, 'type'],
      }),
    ]);
  });

  it('20. regression: correctly sifts down min-heap for 7+ independent flows in lexicographical order', () => {
    const flows: Record<string, { steps: Array<{ type: 'log'; value: string }> }> = {
      g: { steps: [{ type: 'log', value: 'g' }] },
      f: { steps: [{ type: 'log', value: 'f' }] },
      e: { steps: [{ type: 'log', value: 'e' }] },
      d: { steps: [{ type: 'log', value: 'd' }] },
      c: { steps: [{ type: 'log', value: 'c' }] },
      b: { steps: [{ type: 'log', value: 'b' }] },
      a: { steps: [{ type: 'log', value: 'a' }] },
    };
    const result = analyzeActionFlowDeclarations(flows);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.order).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  });

  it('21. regression: pure function does not mutate or freeze caller input and builds distinct canonical tree', () => {
    const rawStep = { type: 'log' as const, value: 'hello' };
    const rawSteps = [rawStep];
    const rawFlow = { steps: rawSteps };
    const input = { submit: rawFlow };

    const result = analyzeActionFlowDeclarations(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Caller input MUST NOT be frozen
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(rawFlow)).toBe(false);
    expect(Object.isFrozen(rawSteps)).toBe(false);
    expect(Object.isFrozen(rawStep)).toBe(false);

    // Canonical output MUST be frozen and have distinct object references
    expect(Object.isFrozen(result.value.flows.submit)).toBe(true);
    expect(Object.isFrozen(result.value.flows.submit.steps)).toBe(true);
    expect(Object.isFrozen(result.value.flows.submit.steps[0])).toBe(true);

    expect(result.value.flows.submit).not.toBe(rawFlow);
    expect(result.value.flows.submit.steps).not.toBe(rawSteps);
    expect(result.value.flows.submit.steps[0]).not.toBe(rawStep);
  });

  it('22. regression: fails close when runFlow.input is explicitly provided as undefined', () => {
    const result = analyzeActionFlowDeclarations({
      main: {
        steps: [{ type: 'runFlow', flow: 'sub', input: undefined }],
      },
      sub: {
        steps: [{ type: 'log', value: 'sub' }],
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'UNDEFINED_VALUE_FORBIDDEN',
        path: ['logic', 'flows', 'main', 'steps', 0, 'input'],
      }),
    ]);
  });

  it('23. regression: requires explicit ActionFlowDeclarations and does not guess wrapper object', () => {
    const resultWrapped = analyzeActionFlowDeclarations({
      flows: {
        submit: {
          steps: [{ type: 'log', value: 'hi' }],
        },
      },
    });
    expect(resultWrapped.ok).toBe(false);
    if (resultWrapped.ok) return;
    expect(resultWrapped.issues).toEqual([
      expect.objectContaining({
        code: 'UNKNOWN_FLOW_FIELD',
        path: ['logic', 'flows', 'flows', 'submit'],
      }),
      expect.objectContaining({
        code: 'FLOW_STEPS_REQUIRED',
        path: ['logic', 'flows', 'flows', 'steps'],
      }),
    ]);
  });
});
