import { componentRegistry } from './index';

/**
 * 获取注册表中所有支持的组件类型名称
 */
export function getSupportedComponentTypes(): string[] {
  return Object.keys(componentRegistry).filter((type) => type !== 'Div'); // 排除原始 HTML 标签
}

/**
 * 获取按分类排列的组件列表（可选，用于更好的 Prompt）
 */
export function getComponentListString(): string {
  const types = getSupportedComponentTypes();
  return types.join(', ');
}
