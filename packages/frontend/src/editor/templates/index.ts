/**
 * 模板加载和管理工具
 */
import type { Template, TemplateMeta, TemplateCategory } from './types';
import type { A2UISchema } from '../../types/schema';

// 导入内置模板
import { dashboardBasicTemplate } from './templates/dashboard-basic';
import { loginSimpleTemplate } from './templates/login-simple';
import { formContactTemplate } from './templates/form-contact';
import { listTableTemplate } from './templates/list-table';
import { profileUserTemplate } from './templates/profile-user';
import { businessDetailTemplate } from './templates/business-detail';

/**
 * 内置模板注册表
 */
const builtinTemplates: Map<string, Template> = new Map([
  ['dashboard-basic', dashboardBasicTemplate],
  ['login-simple', loginSimpleTemplate],
  ['form-contact', formContactTemplate],
  ['list-table', listTableTemplate],
  ['profile-user', profileUserTemplate],
  ['business-detail', businessDetailTemplate],
]);

/**
 * 获取所有模板列表
 */
export function getAllTemplates(): TemplateMeta[] {
  return Array.from(builtinTemplates.values()).map((t) => ({
    id: t.id,
    name: t.name,
    nameZh: t.nameZh,
    description: t.description,
    descriptionZh: t.descriptionZh,
    category: t.category,
    thumbnail: t.thumbnail,
    tags: t.tags,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }));
}

/**
 * 按分类获取模板
 */
export function getTemplatesByCategory(category: TemplateCategory): TemplateMeta[] {
  return getAllTemplates().filter((t) => t.category === category);
}

/**
 * 获取单个模板
 */
export function getTemplate(id: string): Template | undefined {
  return builtinTemplates.get(id);
}

/**
 * 获取模板 Schema
 */
export function getTemplateSchema(id: string): A2UISchema | undefined {
  const template = builtinTemplates.get(id);
  return template?.schema;
}

/**
 * 从模板创建新项目
 */
export function createProjectFromTemplate(
  templateId: string,

  _projectName: string,
): A2UISchema | null {
  const schema = getTemplateSchema(templateId);
  if (!schema) {
    return null;
  }

  // 创建新 Schema，保留模板结构
  // 注意：version 和 rootId 保持不变
  return { ...schema };
}

/**
 * 搜索模板
 */
export function searchTemplates(query: string): TemplateMeta[] {
  const lowerQuery = query.toLowerCase();
  return getAllTemplates().filter(
    (t) =>
      t.name.toLowerCase().includes(lowerQuery) ||
      t.nameZh.includes(query) ||
      t.tags.some((tag) => tag.toLowerCase().includes(lowerQuery)),
  );
}
