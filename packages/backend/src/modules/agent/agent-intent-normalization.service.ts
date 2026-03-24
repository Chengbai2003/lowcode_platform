import { Injectable } from '@nestjs/common';
import type { A2UISchema } from '../schema-context';
import { CollectionTargetResolverService } from '../schema-context/collection-target-resolver.service';

interface IntentAliasDefinition {
  semanticKey: string;
  targetType: string;
  label: string;
  description: string;
  aliases: string[];
}

interface IntentAliasMatch extends IntentAliasDefinition {
  alias: string;
  start: number;
  end: number;
}

export interface NormalizedIntentOption {
  semanticKey: string;
  targetType: string;
  label: string;
  description: string;
}

export type IntentNormalizationResult =
  | {
      status: 'normalized';
      option: NormalizedIntentOption;
    }
  | {
      status: 'confirmation_required';
      options: NormalizedIntentOption[];
    }
  | {
      status: 'no_match';
    };

const INTENT_ALIAS_REGISTRY: IntentAliasDefinition[] = [
  {
    semanticKey: 'form_item',
    targetType: 'FormItem',
    label: '表单项',
    description: '统一修改表单项容器，适合 label、校验和布局类设置。',
    aliases: ['表单项', '表单字段', '字段', '项', '输入项'],
  },
  {
    semanticKey: 'input',
    targetType: 'Input',
    label: '输入框',
    description: '统一修改输入控件本身，适合 placeholder、禁用态、显隐等设置。',
    aliases: ['输入框', '字段', '输入项'],
  },
  {
    semanticKey: 'button',
    targetType: 'Button',
    label: '按钮',
    description: '统一修改按钮组件，例如文案、类型、显隐等属性。',
    aliases: ['按钮'],
  },
];

function collectAliasMatches(instruction: string): IntentAliasMatch[] {
  const matches: IntentAliasMatch[] = [];

  for (const definition of INTENT_ALIAS_REGISTRY) {
    for (const alias of definition.aliases) {
      const normalizedAlias = alias.toLowerCase();
      let searchIndex = 0;

      while (searchIndex <= instruction.length - normalizedAlias.length) {
        const start = instruction.indexOf(normalizedAlias, searchIndex);
        if (start === -1) {
          break;
        }

        matches.push({
          ...definition,
          alias: normalizedAlias,
          start,
          end: start + normalizedAlias.length,
        });
        searchIndex = start + 1;
      }
    }
  }

  return matches;
}

function isShadowedMatch(match: IntentAliasMatch, matches: readonly IntentAliasMatch[]): boolean {
  return matches.some(
    (candidate) =>
      candidate !== match &&
      candidate.alias.length > match.alias.length &&
      candidate.start <= match.start &&
      candidate.end >= match.end,
  );
}

@Injectable()
export class AgentIntentNormalizationService {
  constructor(private readonly collectionTargetResolver: CollectionTargetResolverService) {}

  normalize(input: {
    instruction: string;
    rootId: string;
    schema: A2UISchema;
  }): IntentNormalizationResult {
    const normalizedInstruction = input.instruction.trim().toLowerCase();
    const resolvedMatches = collectAliasMatches(normalizedInstruction).filter(
      (match, _index, matches) => !isShadowedMatch(match, matches),
    );
    const matches = INTENT_ALIAS_REGISTRY.filter((definition) =>
      resolvedMatches.some(
        (match) =>
          match.semanticKey === definition.semanticKey && match.targetType === definition.targetType,
      ),
    )
      .filter((definition) => {
        const resolution = this.collectionTargetResolver.resolve({
          rootId: input.rootId,
          schema: input.schema,
          targetType: definition.targetType,
        });
        return resolution.status === 'matched' || resolution.status === 'over_limit';
      })
      .map(
        (definition): NormalizedIntentOption => ({
          semanticKey: definition.semanticKey,
          targetType: definition.targetType,
          label: definition.label,
          description: definition.description,
        }),
      );

    const deduped = matches.filter(
      (option, index, options) =>
        options.findIndex(
          (candidate) =>
            candidate.semanticKey === option.semanticKey && candidate.targetType === option.targetType,
        ) === index,
    );

    if (deduped.length === 0) {
      return { status: 'no_match' };
    }
    if (deduped.length === 1) {
      return {
        status: 'normalized',
        option: deduped[0],
      };
    }
    return {
      status: 'confirmation_required',
      options: deduped,
    };
  }
}
