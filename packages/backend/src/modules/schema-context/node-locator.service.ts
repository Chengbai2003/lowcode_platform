import { Injectable } from '@nestjs/common';
import { A2UISchema } from './types/schema.types';
import { NodeCandidate } from './types/focus-context.types';
import { ComponentMetaRegistry } from './component-metadata/component-meta.registry';

export interface NodeLocatorResult {
  readonly mode: 'exact' | 'candidates';
  readonly targetId?: string;
  readonly candidates?: readonly NodeCandidate[];
}

interface ScoredMatch {
  readonly score: number;
  readonly reason: string;
  readonly matchType: NodeCandidate['matchType'];
}

const STOP_WORDS = new Set([
  '的',
  '了',
  '把',
  '将',
  '请',
  '帮我',
  '帮',
  '一个',
  '这个',
  '那个',
  '给',
  '让',
  '使',
  '在',
  '到',
  '和',
  '与',
  '或',
  '是',
  '有',
  '为',
  '被',
  '所',
  '着',
  '过',
  '地',
  '得',
  '不',
  '也',
  '都',
  '就',
  '要',
  'the',
  'a',
  'an',
  'is',
  'are',
  'to',
  'of',
  'and',
  'or',
  'this',
  'that',
  'it',
  'in',
  'on',
  'for',
  'with',
  'please',
  'help',
  'me',
]);

function extractKeywords(instruction: string): string[] {
  // Split on whitespace and punctuation first
  const tokens = instruction
    .split(/[\s,，。！？、；：""''（）()[\]{}·\-_=+|\\/<>@#$%^&*~`]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const result: string[] = [];
  for (const token of tokens) {
    if (STOP_WORDS.has(token)) continue;
    result.push(token);
    // For Chinese text longer than 1 char, also extract 2-char substrings as keywords
    // This handles cases like "登录按钮" → ["登录按钮", "登录", "按钮"]
    if (/[\u4e00-\u9fff]/.test(token) && token.length > 2) {
      for (let i = 0; i <= token.length - 2; i++) {
        const sub = token.slice(i, i + 2);
        if (!STOP_WORDS.has(sub)) {
          result.push(sub);
        }
      }
    }
  }
  return [...new Set(result)];
}

@Injectable()
export class NodeLocatorService {
  constructor(private readonly metaRegistry: ComponentMetaRegistry) {}

  locate(schema: A2UISchema, selectedId?: string, instruction?: string): NodeLocatorResult {
    // Case 1: selectedId is valid
    if (selectedId && schema.components[selectedId]) {
      return { mode: 'exact', targetId: selectedId };
    }

    // Case 2: search from instruction
    if (!instruction) {
      return { mode: 'candidates', candidates: [] };
    }

    const keywords = extractKeywords(instruction);
    if (keywords.length === 0) {
      return { mode: 'candidates', candidates: [] };
    }

    return {
      mode: 'candidates',
      candidates: this.findCandidates(schema, keywords),
    };
  }

  private findCandidates(schema: A2UISchema, keywords: readonly string[]): NodeCandidate[] {
    return Object.entries(schema.components)
      .map(([id, comp]) => this.scoreCandidate(id, comp, keywords))
      .filter((candidate): candidate is NodeCandidate => candidate !== undefined)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  private scoreCandidate(
    id: string,
    comp: A2UISchema['components'][string],
    keywords: readonly string[],
  ): NodeCandidate | undefined {
    const typeMatch = this.scoreTypeMatch(comp.type, keywords);
    const propMatch = this.scorePropMatch(comp.type, comp.props, keywords);
    const idMatch = this.scoreIdMatch(id, keywords);

    const totalScore = typeMatch.score + propMatch.score + idMatch.score;
    if (totalScore < 0.1) {
      return undefined;
    }

    const dominantMatch = [typeMatch, propMatch, idMatch].sort((a, b) => b.score - a.score)[0];

    return {
      id,
      type: comp.type,
      score: Math.round(totalScore * 1000) / 1000,
      reason: dominantMatch.reason,
      matchType: dominantMatch.matchType,
    };
  }

  private scoreTypeMatch(type: string, keywords: readonly string[]): ScoredMatch {
    const displayName = this.metaRegistry.getDisplayName(type);
    const typeLower = type.toLowerCase();

    for (const keyword of keywords) {
      const keywordLower = keyword.toLowerCase();
      if (typeLower === keywordLower || displayName === keyword) {
        return {
          score: 0.4,
          matchType: displayName === keyword ? 'display_name' : 'type',
          reason: `类型匹配: ${type}${displayName ? ` (${displayName})` : ''}`,
        };
      }
    }

    for (const keyword of keywords) {
      const keywordLower = keyword.toLowerCase();
      if (typeLower.includes(keywordLower) || (displayName && displayName.includes(keyword))) {
        return {
          score: 0.2,
          matchType: displayName?.includes(keyword) ? 'display_name' : 'type',
          reason: `类型匹配: ${type}${displayName ? ` (${displayName})` : ''}`,
        };
      }
    }

    return { score: 0, reason: '', matchType: 'keyword' };
  }

  private scorePropMatch(
    type: string,
    props: Record<string, unknown> | undefined,
    keywords: readonly string[],
  ): ScoredMatch {
    if (!props) {
      return { score: 0, reason: '', matchType: 'keyword' };
    }

    const textProps = this.metaRegistry.getTextProps(type);
    if (textProps.length === 0) {
      return { score: 0, reason: '', matchType: 'keyword' };
    }

    let matchedCount = 0;
    let matchedPropKey = '';
    let matchedPropValue = '';

    for (const propKey of textProps) {
      const propVal = props[propKey];
      if (typeof propVal !== 'string') continue;
      for (const keyword of keywords) {
        if (propVal.includes(keyword)) {
          matchedCount++;
          matchedPropKey = propKey;
          matchedPropValue = propVal;
          break;
        }
      }
    }

    if (matchedCount === 0) {
      return { score: 0, reason: '', matchType: 'keyword' };
    }

    return {
      score: 0.35 * (matchedCount / keywords.length),
      reason: `文本匹配: props.${matchedPropKey} = '${matchedPropValue}'`,
      matchType: 'prop_value',
    };
  }

  private scoreIdMatch(id: string, keywords: readonly string[]): ScoredMatch {
    const idLower = id.toLowerCase();
    for (const keyword of keywords) {
      if (idLower.includes(keyword.toLowerCase())) {
        return {
          score: 0.25,
          reason: `ID匹配: ${id}`,
          matchType: 'id',
        };
      }
    }

    return { score: 0, reason: '', matchType: 'keyword' };
  }
}
