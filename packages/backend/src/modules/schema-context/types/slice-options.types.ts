export interface SliceOptions {
  readonly maxSubtreeDepth: number;
  readonly maxSubtreeNodes: number;
  readonly maxSiblings: number;
  readonly maxAncestors: number;
  readonly maxOutputBytes: number;
  readonly includeEvents: boolean;
  readonly includeProps: boolean;
}

export const DEFAULT_SLICE_OPTIONS: SliceOptions = {
  maxSubtreeDepth: 5,
  maxSubtreeNodes: 50,
  maxSiblings: 10,
  maxAncestors: 10,
  maxOutputBytes: 8192,
  includeEvents: true,
  includeProps: true,
};
