/**
 * AI Prompt Builder Types
 */

export type PromptLanguage = "en" | "zh";

export interface PromptConfig {
  language?: PromptLanguage;
  supportedComponents?: string[];
  schemaExample?: any;
  includeExplanation?: boolean;
  includeSuggestions?: boolean;
}

export interface SystemPromptOptions {
  role?: string;
  capabilities?: string[];
  formatInstructions?: string;
  constraints?: string[];
}
