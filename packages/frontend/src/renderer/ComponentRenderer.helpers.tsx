/**
 * ComponentRenderer helpers
 * Keep rendering helpers isolated to reduce ComponentRenderer size.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { memo, useEffect } from 'react';
import { shallowEqual } from 'react-redux';
import type { ActionList } from '../types';
import type { EventDispatcher } from './EventDispatcher';
import { deepEqual } from './utils/compare';

export const CONTAINER_COMPONENTS = new Set([
  'Form',
  'Page',
  'Div',
  'Container',
  'Card',
  'Row',
  'Col',
  'Layout',
  'Header',
  'Content',
  'Footer',
  'Sider',
]);

export const INPUT_LEAF_COMPONENTS = new Set([
  'Input',
  'InputPassword',
  'TextArea',
  'InputNumber',
  'Select',
  'Checkbox',
  'Radio',
  'Switch',
  'Slider',
  'DatePicker',
  'RangePicker',
]);

export const resolveVisibilityProps = (resolvedProps: Record<string, unknown>) => {
  const hasVisibleProp = Object.prototype.hasOwnProperty.call(resolvedProps, 'visible');
  const isVisible = !hasVisibleProp || Boolean((resolvedProps as any).visible);

  if (!hasVisibleProp) {
    return { isVisible, sanitizedProps: resolvedProps };
  }

  const { visible, ...rest } = resolvedProps as Record<string, unknown>;
  return { isVisible, sanitizedProps: rest };
};

export const buildFallbackClassName = (
  baseClassName: string | undefined,
  extraClassName: string | undefined,
  id?: string,
  withWrapper?: boolean,
) => {
  const combined = [baseClassName, extraClassName].filter(Boolean).join(' ');
  if (!withWrapper || !id) return combined;
  return [combined, 'lowcode-component-wrapper', `lowcode-component-id-${id}`]
    .filter(Boolean)
    .join(' ');
};

/**
 * 构建 React 事件处理器
 */
export function buildEventHandlers(
  events: Record<string, ActionList>,
  eventDispatcher: EventDispatcher | undefined,
): Record<string, (...args: any[]) => any> {
  if (!eventDispatcher || Object.keys(events).length === 0) {
    return {};
  }

  const handlers: Record<string, (...args: any[]) => any> = {};

  for (const [trigger, actions] of Object.entries(events)) {
    if (actions.length > 0) {
      handlers[trigger] = eventDispatcher.createHandler(actions);
    }
  }

  return handlers;
}

/**
 * Form 同步包装器
 * 用于 Form 组件的双向数据绑定
 */
export const FormSyncWrapper = ({
  Component,
  mergedProps,
  childrenElements,
  id,
  componentValue,
}: {
  Component: any;
  mergedProps: any;
  childrenElements: React.ReactNode;
  id?: string;
  componentValue: any;
}) => {
  const [form] = Component.useForm();

  useEffect(() => {
    if (componentValue) {
      const currentFormValues = form.getFieldsValue();
      if (!deepEqual(currentFormValues, componentValue)) {
        form.setFieldsValue(componentValue);
      }
    }
  }, [componentValue, form]);

  return (
    <Component {...mergedProps} form={form} id={id}>
      {childrenElements}
    </Component>
  );
};

/**
 * 基础组件包装器
 * 处理 children 合并逻辑
 */
export const BaseComponent = memo(
  ({
    Component,
    mergedProps,
    childrenElements,
    id,
  }: {
    Component: React.ComponentType<any>;
    mergedProps: any;
    childrenElements: React.ReactNode;
    id?: string;
  }) => {
    const propsChildren = mergedProps.children;

    let finalChildren: React.ReactNode;
    if (childrenElements) {
      if (propsChildren != null && propsChildren !== '') {
        finalChildren = (
          <>
            {propsChildren}
            {childrenElements}
          </>
        );
      } else {
        finalChildren = childrenElements;
      }
    } else {
      finalChildren = propsChildren;
    }

    return (
      <Component {...mergedProps} id={id}>
        {finalChildren}
      </Component>
    );
  },
  (prevProps, nextProps) => {
    if (prevProps.Component !== nextProps.Component) return false;
    if (prevProps.id !== nextProps.id) return false;
    if (prevProps.childrenElements !== nextProps.childrenElements) return false;
    if (!shallowEqual(prevProps.mergedProps, nextProps.mergedProps)) return false;
    return true;
  },
);
