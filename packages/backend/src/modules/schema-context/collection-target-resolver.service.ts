import { Injectable } from '@nestjs/common';
import { ComponentMetaRegistry } from './component-metadata/component-meta.registry';
import { A2UISchema } from './types/schema.types';

const MIN_BATCH_TARGETS = 2;
const MAX_BATCH_TARGETS = 10;

export type CollectionTargetResolution =
  | {
      status: 'matched';
      rootId: string;
      matchedType: string;
      matchedDisplayName: string;
      componentIds: string[];
      targetCount: number;
      matchReason: string;
    }
  | {
      status: 'ambiguous';
      rootId: string;
      candidateTypes: string[];
      reason: string;
    }
  | {
      status: 'no_match';
      rootId: string;
      reason: string;
    }
  | {
      status: 'over_limit';
      rootId: string;
      matchedType: string;
      matchedDisplayName: string;
      targetCount: number;
      reason: string;
    };

@Injectable()
export class CollectionTargetResolverService {
  constructor(private readonly componentMetaRegistry: ComponentMetaRegistry) {}

  resolve(input: {
    rootId: string;
    instruction: string;
    schema: A2UISchema;
  }): CollectionTargetResolution {
    const rootNode = input.schema.components[input.rootId];
    if (!rootNode) {
      return {
        status: 'no_match',
        rootId: input.rootId,
        reason: `容器 ${input.rootId} 不存在`,
      };
    }

    if (!this.componentMetaRegistry.isContainer(rootNode.type)) {
      return {
        status: 'no_match',
        rootId: input.rootId,
        reason: `组件 ${input.rootId} 不是可用于批量范围的容器`,
      };
    }

    const descendants = this.collectDescendants(input.schema, input.rootId);
    if (descendants.length === 0) {
      return {
        status: 'no_match',
        rootId: input.rootId,
        reason: '当前容器下没有可解析的子组件',
      };
    }

    const matchedTypes = this.findMatchedTypes(descendants, input.instruction);
    if (matchedTypes.length === 0) {
      return {
        status: 'no_match',
        rootId: input.rootId,
        reason: '未在当前容器内识别出稳定的同类组件类型，请明确组件类型后再试',
      };
    }

    if (matchedTypes.length > 1) {
      return {
        status: 'ambiguous',
        rootId: input.rootId,
        candidateTypes: matchedTypes.map((item) => item.type),
        reason: `当前指令同时命中了多种组件类型：${matchedTypes
          .map((item) => item.displayName)
          .join('、')}`,
      };
    }

    const match = matchedTypes[0];
    if (match.componentIds.length < MIN_BATCH_TARGETS) {
      return {
        status: 'no_match',
        rootId: input.rootId,
        reason: `当前容器内仅找到 ${match.componentIds.length} 个 ${match.displayName}，不足以构成批量修改`,
      };
    }

    if (match.componentIds.length > MAX_BATCH_TARGETS) {
      return {
        status: 'over_limit',
        rootId: input.rootId,
        matchedType: match.type,
        matchedDisplayName: match.displayName,
        targetCount: match.componentIds.length,
        reason: `当前容器内共有 ${match.componentIds.length} 个 ${match.displayName}，已超过批量修改上限 ${MAX_BATCH_TARGETS}`,
      };
    }

    return {
      status: 'matched',
      rootId: input.rootId,
      matchedType: match.type,
      matchedDisplayName: match.displayName,
      componentIds: match.componentIds,
      targetCount: match.componentIds.length,
      matchReason: `在容器 ${input.rootId} 下识别到 ${match.componentIds.length} 个 ${match.displayName}`,
    };
  }

  private collectDescendants(schema: A2UISchema, rootId: string) {
    const descendants: Array<{ id: string; type: string }> = [];
    const stack = [...(schema.components[rootId]?.childrenIds ?? [])].reverse();

    while (stack.length > 0) {
      const currentId = stack.pop()!;
      const component = schema.components[currentId];
      if (!component) {
        continue;
      }

      descendants.push({ id: component.id, type: component.type });
      const children = [...(component.childrenIds ?? [])].reverse();
      for (const childId of children) {
        stack.push(childId);
      }
    }

    return descendants;
  }

  private findMatchedTypes(
    descendants: Array<{ id: string; type: string }>,
    instruction: string,
  ): Array<{ type: string; displayName: string; componentIds: string[] }> {
    const normalizedInstruction = instruction.trim().toLowerCase();
    const grouped = new Map<string, string[]>();

    for (const node of descendants) {
      const ids = grouped.get(node.type) ?? [];
      ids.push(node.id);
      grouped.set(node.type, ids);
    }

    return Array.from(grouped.entries())
      .map(([type, componentIds]) => {
        const displayName = this.componentMetaRegistry.getDisplayName(type) ?? type;
        const typeMatched =
          normalizedInstruction.includes(type.toLowerCase()) ||
          normalizedInstruction.includes(displayName.toLowerCase());

        if (!typeMatched) {
          return undefined;
        }

        return {
          type,
          displayName,
          componentIds,
        };
      })
      .filter(
        (
          item,
        ): item is {
          type: string;
          displayName: string;
          componentIds: string[];
        } => Boolean(item),
      );
  }
}
