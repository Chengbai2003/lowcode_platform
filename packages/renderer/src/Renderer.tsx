import React from 'react';
import type { ComponentSchema, RendererProps, ComponentRegistry } from './types';

/**
 * 默认内置组件
 */
const builtInComponents: ComponentRegistry = {
  // 容器组件
  Page: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  Div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  Span: ({ children, ...props }: any) => <span {...props}>{children}</span>,

  // 布局组件
  Container: ({ children, style, ...props }: any) => (
    <div style={{ ...style, padding: '16px' }} {...props}>{children}</div>
  ),
  Row: ({ children, style, ...props }: any) => (
    <div style={{ ...style, display: 'flex', flexDirection: 'row' }} {...props}>{children}</div>
  ),
  Col: ({ children, style, ...props }: any) => (
    <div style={{ ...style, flex: 1 }} {...props}>{children}</div>
  ),

  // 文本组件
  Text: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  Title: ({ children, level = 1, ...props }: any) => {
    const HeadingTag = `h${level}` as keyof JSX.IntrinsicElements;
    return <HeadingTag {...props}>{children}</HeadingTag>;
  },
  Paragraph: ({ children, ...props }: any) => <p {...props}>{children}</p>,

  // 表单组件（占位符 - 实际使用 components 包中的 Ant Design 组件）
  Input: (props: any) => <input {...props} />,
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  TextArea: (props: any) => <textarea {...props} />,

  // 展示组件
  Image: ({ src, alt, ...props }: any) => <img src={src} alt={alt} {...props} />,
  Link: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
};

/**
 * 类型守卫：检查值是否为 ComponentSchema
 */
function isComponentSchema(value: unknown): value is ComponentSchema {
  return typeof value === 'object' && value !== null && 'componentName' in value;
}

/**
 * 递归渲染子组件
 */
function renderChildren(
  children: ComponentSchema | ComponentSchema[] | string | string[] | undefined,
  components: ComponentRegistry,
  onComponentClick?: (schema: ComponentSchema) => void
): React.ReactNode {
  if (children === undefined || children === null) {
    return null;
  }

  if (typeof children === 'string' || typeof children === 'number') {
    return children;
  }

  if (Array.isArray(children)) {
    return children.map((child, index) => {
      if (typeof child === 'string') {
        return child;
      }
      if (isComponentSchema(child)) {
        return <ComponentRenderer key={child.id || `child-${index}`} schema={child} components={components} onComponentClick={onComponentClick} />;
      }
      return null;
    });
  }

  return <ComponentRenderer schema={children} components={components} onComponentClick={onComponentClick} />;
}

/**
 * 单个组件渲染器
 */
function ComponentRenderer({ schema, components, onComponentClick }: { schema: ComponentSchema; components: ComponentRegistry; onComponentClick?: (schema: ComponentSchema) => void }): React.ReactElement | null {
  const { componentName, props = {}, children } = schema;

  // 从注册表或内置组件中获取组件
  const Component = components[componentName] || builtInComponents[componentName];

  // 组件未找到时降级为 div（容错处理）
  if (!Component) {
    console.warn(`Component "${componentName}" not found in registry, rendering as div`);
    return (
      <div {...props} data-fallback-component={componentName}>
        {renderChildren(children, components, onComponentClick)}
      </div>
    );
  }

  // 渲染组件及其子组件
  const element = (
    <Component {...props}>
      {renderChildren(children, components, onComponentClick)}
    </Component>
  );

  // 如果提供了点击处理器，包裹一层
  if (onComponentClick) {
    return (
      <div
        onClick={() => onComponentClick(schema)}
        style={{ cursor: 'pointer' }}
        data-component-id={schema.id}
      >
        {element}
      </div>
    );
  }

  return element;
}

/**
 * 主渲染器组件
 */
export function Renderer({ schema, components = {}, onComponentClick }: RendererProps): React.ReactElement {
  const allComponents = { ...builtInComponents, ...components };

  return <ComponentRenderer schema={schema} components={allComponents} onComponentClick={onComponentClick} />;
}

/**
 * 导出内置组件供自定义使用
 */
export { builtInComponents };
