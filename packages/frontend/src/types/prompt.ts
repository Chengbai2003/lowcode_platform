/**
 * AI Prompt Builder Types
 */

export type PromptLanguage = 'en' | 'zh';

export interface PromptConfig {
  language?: PromptLanguage;
  supportedComponents?: string[];
  schemaExample?: Record<string, unknown>;
  includeExplanation?: boolean;
  includeSuggestions?: boolean;
}

export interface SystemPromptOptions {
  role?: string;
  capabilities?: string[];
  formatInstructions?: string;
  constraints?: string[];
}
