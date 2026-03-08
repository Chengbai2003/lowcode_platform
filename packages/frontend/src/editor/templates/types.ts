/**
 * 模板类型定义
 */
import type { A2UISchema } from '../../types/schema';

/**
 * 模板元数据
 */
export interface TemplateMeta {
  id: string;
  name: string;
  nameZh: string;
  description: string;
  descriptionZh: string;
  category: TemplateCategory;
  thumbnail?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * 模板分类
 */
export type TemplateCategory =
  | 'dashboard'
  | 'form'
  | 'list'
  | 'login'
  | 'profile'
  | 'marketing'
  | 'error'
  | 'other';

/**
 * 完整模板定义
 */
export interface Template extends TemplateMeta {
  schema: A2UISchema;
  /**
   * 示例 Prompt（可选）
   * 展示"如何描述才能生成类似效果"，帮助用户学习 AI 交互方式
   */
  examplePrompt?: string;
}

/**
 * 内置模板 ID
 */
export const BUILTIN_TEMPLATE_IDS = [
  'dashboard-basic',
  'login-simple',
  'form-contact',
  'list-table',
  'profile-user',
] as const;

export type BuiltinTemplateId = (typeof BUILTIN_TEMPLATE_IDS)[number];
