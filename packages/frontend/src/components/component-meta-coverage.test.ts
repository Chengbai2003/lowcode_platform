import { describe, expect, it } from 'vitest';
import type { ComponentPanelConfig, EditorType } from '../types';
import { componentRegistry, getComponentMeta } from './index';

const SUPPORTED_EDITORS = new Set<EditorType>([
  'string',
  'number',
  'boolean',
  'select',
  'color',
  'json',
  'tableColumns',
  'formRules',
  'slot',
  'expression',
]);

const SHARED_META_COMPONENT_TYPE: Record<string, string> = {
  Paragraph: 'Text',
};

const STANDARD_GROUPS = new Set(['基础', '样式', '高级']);

const TARGET_28_COMPONENTS = [
  'Div',
  'CheckboxGroup',
  'RadioGroup',
  'RadioButton',
  'Slider',
  'List',
  'ListItem',
  'TabPane',
  'Collapse',
  'CollapsePanel',
  'Popover',
  'Tooltip',
  'Row',
  'Col',
  'Layout',
  'Header',
  'Content',
  'Footer',
  'Sider',
  'Tag',
  'Badge',
  'Steps',
  'Step',
  'Progress',
  'Spin',
  'Skeleton',
  'DatePicker',
  'RangePicker',
] as const;

function isSerializableValue(value: unknown): boolean {
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    return false;
  }
  if (Array.isArray(value)) {
    return value.every((item) => isSerializableValue(item));
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).every((item) =>
      isSerializableValue(item),
    );
  }
  return true;
}

describe('component meta coverage', () => {
  it('keeps registry and meta coverage at 50/50', () => {
    const entries = Object.entries(componentRegistry);
    expect(entries).toHaveLength(50);

    const missingMeta = entries
      .filter(([, entry]) => !entry.meta)
      .map(([componentType]) => componentType);
    expect(missingMeta).toEqual([]);

    entries.forEach(([componentType, entry]) => {
      const meta = entry.meta as ComponentPanelConfig;
      const expectedComponentType = SHARED_META_COMPONENT_TYPE[componentType] || componentType;
      expect(meta.componentType).toBe(expectedComponentType);
      expect(meta.properties.length).toBeGreaterThan(0);
      expect(getComponentMeta(componentType)).toBeDefined();
    });
  });

  it('uses supported editor types and safe visible guards', () => {
    const invalidEditors: string[] = [];
    const invalidVisibleGuards: string[] = [];

    Object.entries(componentRegistry).forEach(([componentType, entry]) => {
      if (!entry.meta) return;
      const resolvedProps = entry.meta.properties.reduce<Record<string, unknown>>((acc, prop) => {
        acc[prop.key] = prop.defaultValue;
        return acc;
      }, {});

      entry.meta.properties.forEach((prop) => {
        if (!SUPPORTED_EDITORS.has(prop.editor)) {
          invalidEditors.push(`${componentType}.${prop.key}:${prop.editor}`);
        }
        if (!prop.visible) return;
        try {
          const result = prop.visible(resolvedProps);
          if (typeof result !== 'boolean') {
            invalidVisibleGuards.push(`${componentType}.${prop.key}:non-boolean`);
          }
        } catch {
          invalidVisibleGuards.push(`${componentType}.${prop.key}:throws`);
        }
      });
    });

    expect(invalidEditors).toEqual([]);
    expect(invalidVisibleGuards).toEqual([]);
  });

  it('keeps meta baseline spec consistent (group/default/options)', () => {
    const invalidGroups: string[] = [];
    const missingDefaults: string[] = [];
    const invalidSelectOptions: string[] = [];

    Object.entries(componentRegistry).forEach(([componentType, entry]) => {
      if (!entry.meta) return;

      entry.meta.properties.forEach((prop) => {
        if (!prop.group || !STANDARD_GROUPS.has(prop.group)) {
          invalidGroups.push(`${componentType}.${prop.key}:${String(prop.group)}`);
        }

        if (!Object.prototype.hasOwnProperty.call(prop, 'defaultValue')) {
          missingDefaults.push(`${componentType}.${prop.key}`);
        }

        if (prop.editor === 'select') {
          if (!Array.isArray(prop.options) || prop.options.length === 0) {
            invalidSelectOptions.push(`${componentType}.${prop.key}:missing`);
            return;
          }
          prop.options.forEach((option, index) => {
            if (
              !option ||
              typeof option.label !== 'string' ||
              option.label.length === 0 ||
              (typeof option.value !== 'string' && typeof option.value !== 'number')
            ) {
              invalidSelectOptions.push(`${componentType}.${prop.key}[${index}]`);
            }
          });
        }
      });
    });

    expect(invalidGroups).toEqual([]);
    expect(missingDefaults).toEqual([]);
    expect(invalidSelectOptions).toEqual([]);
  });

  it('ensures target 28 component metas are editable with grouped serializable defaults', () => {
    const missingTargetMeta: string[] = [];
    const invalidTargetProps: string[] = [];

    TARGET_28_COMPONENTS.forEach((componentType) => {
      const meta = getComponentMeta(componentType);
      if (!meta) {
        missingTargetMeta.push(componentType);
        return;
      }

      meta.properties.forEach((prop) => {
        if (!prop.group || !STANDARD_GROUPS.has(prop.group)) {
          invalidTargetProps.push(`${componentType}.${prop.key}:group`);
        }
        if (!Object.prototype.hasOwnProperty.call(prop, 'defaultValue')) {
          invalidTargetProps.push(`${componentType}.${prop.key}:default`);
        }
        if (!isSerializableValue(prop.defaultValue)) {
          invalidTargetProps.push(`${componentType}.${prop.key}:serializable`);
        }
      });
    });

    expect(missingTargetMeta).toEqual([]);
    expect(invalidTargetProps).toEqual([]);
  });
});
