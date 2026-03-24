import { Injectable, NotFoundException } from '@nestjs/common';
import { A2UIComponent, A2UISchema } from './types/schema.types';
import {
  AncestorEntry,
  FocusContext,
  NodeSummary,
  SchemaStats,
  SiblingInfo,
} from './types/focus-context.types';
import { DEFAULT_SLICE_OPTIONS, SliceOptions } from './types/slice-options.types';
import { buildAncestorChain, buildParentMap } from './utils/parent-map.builder';
import { computeMaxDepth, extractSubtree } from './utils/tree-walker';

interface SliceState {
  focusNode: NodeSummary;
  parent: NodeSummary | null;
  ancestors: readonly AncestorEntry[];
  children: readonly NodeSummary[];
  fullChildren: readonly NodeSummary[];
  siblingEntries: readonly SiblingInfo[];
  currentSiblings: readonly SiblingInfo[];
  subtree: Readonly<Record<string, A2UIComponent>>;
}

interface BudgetEvaluation {
  readonly result: FocusContext;
  readonly size: number;
}

function toNodeSummary(
  id: string,
  comp: A2UIComponent,
  options?: {
    includeProps?: boolean;
    includeEvents?: boolean;
    includeChildrenIds?: boolean;
  },
): NodeSummary {
  const { includeProps = true, includeEvents = true, includeChildrenIds = true } = options || {};

  return {
    id,
    type: comp.type,
    ...(includeProps && comp.props !== undefined ? { props: comp.props } : {}),
    ...(includeChildrenIds && comp.childrenIds !== undefined
      ? { childrenIds: comp.childrenIds }
      : {}),
    ...(includeEvents && comp.events !== undefined ? { events: comp.events } : {}),
  };
}

function toCompactSummary(summary: NodeSummary): NodeSummary {
  return {
    id: summary.id,
    type: summary.type,
  };
}

function stripProps(subtree: Record<string, A2UIComponent>): Record<string, A2UIComponent> {
  const result: Record<string, A2UIComponent> = {};
  for (const [id, comp] of Object.entries(subtree)) {
    result[id] = { id: comp.id, type: comp.type, childrenIds: comp.childrenIds } as A2UIComponent;
  }
  return result;
}

function stripEvents(subtree: Record<string, A2UIComponent>): Record<string, A2UIComponent> {
  const result: Record<string, A2UIComponent> = {};
  for (const [id, comp] of Object.entries(subtree)) {
    const { events: _, ...rest } = comp;
    result[id] = rest as A2UIComponent;
  }
  return result;
}

function applySubtreeOptions(
  subtree: Record<string, A2UIComponent>,
  options: SliceOptions,
): Record<string, A2UIComponent> {
  let result = subtree;
  if (!options.includeEvents) {
    result = stripEvents(result);
  }
  if (!options.includeProps) {
    result = stripProps(result);
  }
  return result;
}

function uniqueLimits(currentLength: number, limits: readonly number[]): number[] {
  return limits.filter(
    (limit, index, list) => currentLength > limit && list.indexOf(limit) === index,
  );
}

@Injectable()
export class SchemaSlicerService {
  slice(schema: A2UISchema, targetId: string, options?: Partial<SliceOptions>): FocusContext {
    const opts: SliceOptions = { ...DEFAULT_SLICE_OPTIONS, ...options };
    const { components } = schema;
    const targetComp = this.getTargetComponent(targetId, components);
    const parentMap = buildParentMap(components);
    const schemaStats = this.buildSchemaStats(schema, components);
    const state = this.buildInitialState(targetId, targetComp, components, parentMap, opts);

    return this.resolveWithinBudget(state, {
      components,
      targetId,
      options: opts,
      schemaStats,
    });
  }

  private getTargetComponent(
    targetId: string,
    components: A2UISchema['components'],
  ): A2UIComponent {
    const targetComp = components[targetId];
    if (!targetComp) {
      throw new NotFoundException(`Component "${targetId}" not found in schema`);
    }
    return targetComp;
  }

  private buildSchemaStats(schema: A2UISchema, components: A2UISchema['components']): SchemaStats {
    return {
      totalComponents: Object.keys(components).length,
      maxDepth: computeMaxDepth(schema.rootId, components),
      rootId: schema.rootId,
      version: schema.version,
    };
  }

  private buildInitialState(
    targetId: string,
    targetComp: A2UIComponent,
    components: A2UISchema['components'],
    parentMap: ReadonlyMap<string, string>,
    options: SliceOptions,
  ): SliceState {
    const allAncestors = buildAncestorChain(targetId, parentMap, components);
    const parentId = parentMap.get(targetId);
    const parentComp = parentId ? components[parentId] : undefined;
    const siblingEntries = this.buildSiblingEntries(targetId, parentComp, components, options);
    const fullChildren = this.buildChildSummaries(targetComp, components, options);

    return {
      focusNode: toNodeSummary(targetId, targetComp, {
        includeProps: options.includeProps,
        includeEvents: options.includeEvents,
      }),
      parent: parentComp
        ? toNodeSummary(parentId!, parentComp, {
            includeProps: options.includeProps,
            includeEvents: options.includeEvents,
          })
        : null,
      ancestors: allAncestors.slice(-options.maxAncestors),
      children: [...fullChildren],
      fullChildren,
      siblingEntries,
      currentSiblings: siblingEntries,
      subtree: applySubtreeOptions(
        extractSubtree(targetId, components, options.maxSubtreeDepth, options.maxSubtreeNodes),
        options,
      ),
    };
  }

  private buildSiblingEntries(
    targetId: string,
    parentComp: A2UIComponent | undefined,
    components: A2UISchema['components'],
    options: SliceOptions,
  ): SiblingInfo[] {
    return (parentComp?.childrenIds ?? [])
      .map((id, index) => ({ id, type: components[id]?.type ?? 'unknown', index }))
      .filter((sibling) => sibling.id !== targetId)
      .slice(0, options.maxSiblings);
  }

  private buildChildSummaries(
    targetComp: A2UIComponent,
    components: A2UISchema['components'],
    options: SliceOptions,
  ): NodeSummary[] {
    return (targetComp.childrenIds ?? [])
      .map((id) => components[id])
      .filter(Boolean)
      .map((comp) =>
        toNodeSummary(comp.id, comp, {
          includeProps: options.includeProps,
          includeEvents: options.includeEvents,
        }),
      );
  }

  private resolveWithinBudget(
    state: SliceState,
    input: {
      components: A2UISchema['components'];
      targetId: string;
      options: SliceOptions;
      schemaStats: SchemaStats;
    },
  ): FocusContext {
    return (
      this.evaluateIfWithinBudget(state, input.schemaStats, input.options) ??
      this.trySubtreeDepthFallbacks(state, input) ??
      this.tryGeneralFallbacks(state, input.schemaStats, input.options)
    ).result;
  }

  private trySubtreeDepthFallbacks(
    state: SliceState,
    input: {
      components: A2UISchema['components'];
      targetId: string;
      options: SliceOptions;
      schemaStats: SchemaStats;
    },
  ): BudgetEvaluation | undefined {
    for (let depth = input.options.maxSubtreeDepth - 1; depth >= 1; depth -= 1) {
      state.subtree = applySubtreeOptions(
        extractSubtree(input.targetId, input.components, depth, input.options.maxSubtreeNodes),
        input.options,
      );

      const evaluation = this.evaluateIfWithinBudget(state, input.schemaStats, input.options);
      if (evaluation) {
        return evaluation;
      }
    }

    return undefined;
  }

  private tryGeneralFallbacks(
    state: SliceState,
    schemaStats: SchemaStats,
    options: SliceOptions,
  ): BudgetEvaluation {
    state.subtree = stripProps({ ...state.subtree });
    const subtreeStripped = this.evaluateIfWithinBudget(state, schemaStats, options);
    if (subtreeStripped) {
      return subtreeStripped;
    }

    state.currentSiblings = state.siblingEntries.slice(0, 3);
    const truncatedSiblings = this.evaluateIfWithinBudget(state, schemaStats, options);
    if (truncatedSiblings) {
      return truncatedSiblings;
    }

    state.children = state.fullChildren.map(toCompactSummary);
    const compactChildren = this.evaluateIfWithinBudget(state, schemaStats, options);
    if (compactChildren) {
      return compactChildren;
    }

    const reducedChildren = this.tryChildLimitFallbacks(state, schemaStats, options);
    if (reducedChildren) {
      return reducedChildren;
    }

    state.focusNode = toCompactSummary(state.focusNode);
    state.parent = state.parent ? toCompactSummary(state.parent) : null;
    const compactFocus = this.evaluateIfWithinBudget(state, schemaStats, options);
    if (compactFocus) {
      return compactFocus;
    }

    const reducedAncestors = this.tryAncestorFallbacks(state, schemaStats, options);
    if (reducedAncestors) {
      return reducedAncestors;
    }

    state.subtree = {};
    state.currentSiblings = [];
    state.children = [];
    return this.evaluateState(state, schemaStats);
  }

  private tryChildLimitFallbacks(
    state: SliceState,
    schemaStats: SchemaStats,
    options: SliceOptions,
  ): BudgetEvaluation | undefined {
    for (const limit of uniqueLimits(state.children.length, [20, 10, 5, 3, 1, 0])) {
      state.children = state.fullChildren.slice(0, limit).map(toCompactSummary);
      const evaluation = this.evaluateIfWithinBudget(state, schemaStats, options);
      if (evaluation) {
        return evaluation;
      }
    }

    return undefined;
  }

  private tryAncestorFallbacks(
    state: SliceState,
    schemaStats: SchemaStats,
    options: SliceOptions,
  ): BudgetEvaluation | undefined {
    for (const limit of uniqueLimits(state.ancestors.length, [5, 3, 1, 0])) {
      state.ancestors = limit === 0 ? [] : state.ancestors.slice(-limit);
      const evaluation = this.evaluateIfWithinBudget(state, schemaStats, options);
      if (evaluation) {
        return evaluation;
      }
    }

    return undefined;
  }

  private evaluateIfWithinBudget(
    state: SliceState,
    schemaStats: SchemaStats,
    options: SliceOptions,
  ): BudgetEvaluation | undefined {
    const evaluation = this.evaluateState(state, schemaStats);
    return evaluation.size <= options.maxOutputBytes ? evaluation : undefined;
  }

  private evaluateState(state: SliceState, schemaStats: SchemaStats): BudgetEvaluation {
    const resultWithoutEstimate = {
      focusNode: state.focusNode,
      parent: state.parent,
      ancestors: state.ancestors,
      children: state.children,
      siblings: state.currentSiblings,
      subtree: state.subtree,
      schemaStats,
      estimatedTokens: 0,
    } satisfies FocusContext;

    const serialized = JSON.stringify(resultWithoutEstimate);
    const estimatedTokens = Math.ceil(serialized.length / 4);

    return {
      result: {
        ...resultWithoutEstimate,
        estimatedTokens,
      },
      size: serialized.length,
    };
  }
}
