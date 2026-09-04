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

  it('24. regression: aborts immediately on maxIssues when single flow carries numerous unknown fields', () => {
    const maliciousFlow: Record<string, unknown> = {
      steps: [{ type: 'log', value: 'hello' }],
    };
    for (let i = 0; i < 20; i++) {
      maliciousFlow[`extraField_${i}`] = i;
    }

    const result = analyzeActionFlowDeclarations(
      {
        main: maliciousFlow,
      },
      { maxIssues: 3 },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.length).toBe(3);
    for (const issue of result.issues) {
      expect(issue.code).toBe('UNKNOWN_FLOW_FIELD');
    }
  });

  it('25. regression: safely handles own __proto__ property in JSON without prototype pollution or inheritance loss', () => {
    const jsonWithProto = JSON.parse('{"__proto__": {"polluted": true}, "normal": 42}');
    const result = analyzeActionFlowDeclarations({
      main: {
        steps: [
          {
            type: 'setValue',
            field: 'state.data',
            value: jsonWithProto,
          },
        ],
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const action = result.value.flows.main.steps[0] as any;
    expect(action.type).toBe('setValue');
    const cleanValue = action.value;

    // 1. Prototype must be null (no prototype pollution)
    expect(Object.getPrototypeOf(cleanValue)).toBeNull();

    // 2. __proto__ must exist as an own property
    expect(Object.prototype.hasOwnProperty.call(cleanValue, '__proto__')).toBe(true);

    // 3. Must not inherit polluted properties
    expect((cleanValue as any).polluted).toBeUndefined();

    // 4. __proto__ own value must be preserved and deep-frozen
    const protoVal = (cleanValue as any)['__proto__'];
    expect(protoVal.polluted).toBe(true);
    expect(Object.isFrozen(cleanValue)).toBe(true);
    expect(Object.isFrozen(protoVal)).toBe(true);

    // 5. Global Object.prototype must NOT be polluted
    expect(({} as any).polluted).toBeUndefined();
  });

  it('26. regression: fails close when explicit onError: undefined is provided', () => {
    const result = analyzeActionFlowDeclarations({
      main: {
        steps: [{ type: 'log', value: 'hello' }],
        onError: undefined,
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'INVALID_FLOW_ON_ERROR',
        path: ['logic', 'flows', 'main', 'onError'],
      }),
    ]);
  });

  it('27. regression: a <-> b, c -> a only reports a and b as cycle members, never falsely marks c', () => {
    const flows = {
      a: { steps: [{ type: 'runFlow', flow: 'b' }] },
      b: { steps: [{ type: 'runFlow', flow: 'a' }] },
      c: { steps: [{ type: 'runFlow', flow: 'a' }] },
    };
    const result = analyzeActionFlowDeclarations(flows);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    const cycleIssues = result.issues.filter((i) => i.code === 'FLOW_REFERENCE_CYCLE');
    const cycleKeys = cycleIssues.map((i) => i.path[i.path.length - 1]);
    expect(cycleKeys).toEqual(['a', 'b']);
    expect(cycleKeys).not.toContain('c');
  });

  it('28. regression: 10,000 node cycle does not throw RangeError and reports structured cycle issues within budget', () => {
    const count = 10_000;
    const declarations: Record<string, unknown> = Object.create(null);
    for (let i = 0; i < count; i++) {
      const next = (i + 1) % count;
      declarations[`flow_${i}`] = {
        steps: [{ type: 'runFlow', flow: `flow_${next}` }],
      };
    }

    let result: any;
    expect(() => {
      result = analyzeActionFlowDeclarations(declarations, {
        maxFlowEntries: count,
        maxActionNodes: count,
        maxIssues: 50,
      });
    }).not.toThrow();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.length).toBe(50);
    for (const issue of result.issues) {
      expect(issue.code).toBe('FLOW_REFERENCE_CYCLE');
    }
  });

  it('29. combined depth: fails close when nested action + cross-flow depth exceeds maxActionDepth', () => {
    const result = analyzeActionFlowDeclarations(
      {
        flowA: {
          steps: [
            {
              type: 'if',
              condition: 'true',
              then: [
                {
                  type: 'if',
                  condition: 'true',
                  then: [{ type: 'runFlow', flow: 'flowB' }],
                },
              ],
            },
          ],
        },
        flowB: {
          steps: [{ type: 'log', value: 'leaf' }],
        },
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

  it('30. combined depth: succeeds when combined depth is exactly equal to maxActionDepth', () => {
    const result = analyzeActionFlowDeclarations(
      {
        flowA: {
          steps: [
            {
              type: 'if',
              condition: 'true',
              then: [{ type: 'runFlow', flow: 'flowB' }],
            },
          ],
        },
        flowB: {
          steps: [{ type: 'log', value: 'leaf' }],
        },
      },
      { maxActionDepth: 3 },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.order).toEqual(['flowB', 'flowA']);
  });

  it('31. combined depth: adopts deepest reference when same dependency is referenced at different depths', () => {
    const result = analyzeActionFlowDeclarations(
      {
        flowA: {
          steps: [
            {
              type: 'runFlow',
              flow: 'flowB',
            },
            {
              type: 'if',
              condition: 'true',
              then: [
                {
                  type: 'if',
                  condition: 'true',
                  then: [{ type: 'runFlow', flow: 'flowB' }],
                },
              ],
            },
          ],
        },
        flowB: {
          steps: [{ type: 'log', value: 'leaf' }],
        },
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

  it('32. combined depth: leaf flow with nested actions counts toward total effective depth', () => {
    const result = analyzeActionFlowDeclarations(
      {
        flowA: {
          steps: [
            {
              type: 'if',
              condition: 'true',
              then: [{ type: 'runFlow', flow: 'flowB' }],
            },
          ],
        },
        flowB: {
          steps: [
            {
              type: 'if',
              condition: 'true',
              then: [{ type: 'log', value: 'nested leaf action' }],
            },
          ],
        },
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
});
