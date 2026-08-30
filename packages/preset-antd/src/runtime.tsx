/**
 * @lowcode-platform/preset-antd/runtime
 *
 * AntD Preset 的运行时组件注册表（Issue #19 / M0-4 Scope B）。
 * 自 Renderer 包的 builtInComponents 迁入：Renderer 本体不再出现任何
 * AntD/组件库依赖与条件分支。
 *
 * 基础组件为原生 HTML 轻包装；Text/Title/Paragraph 复用 antd Typography。
 */

import React from 'react';
import { Typography as AntTypography } from 'antd';
import type { ComponentRegistry } from '@lowcode-platform/renderer';

// 创建 Text、Title、Paragraph 的包装组件
// 确保它们作为 React 组件正常工作
const TypographyText = (props: React.ComponentProps<typeof AntTypography.Text>) => (
  <AntTypography.Text {...props} />
);
const TypographyTitle = (props: React.ComponentProps<typeof AntTypography.Title>) => (
  <AntTypography.Title {...props} />
);
const TypographyParagraph = (props: React.ComponentProps<typeof AntTypography.Paragraph>) => (
  <AntTypography.Paragraph {...props} />
);

/**
 * AntD Preset 运行时组件
 */
export const antdRuntime: ComponentRegistry = {
  Page: ({ children, ...props }: React.ComponentProps<any>) => <div {...props}>{children}</div>,
  Div: ({ children, ...props }: React.ComponentProps<any>) => <div {...props}>{children}</div>,
  Span: ({ children, ...props }: React.ComponentProps<any>) => <span {...props}>{children}</span>,
  Container: ({ children, style, ...props }: React.ComponentProps<any>) => (
    <div style={{ ...style, padding: '16px' }} {...props}>
      {children}
    </div>
  ),
  Row: ({ children, style, ...props }: React.ComponentProps<any>) => (
    <div style={{ ...style, display: 'flex', flexDirection: 'row' }} {...props}>
      {children}
    </div>
  ),
  Col: ({ children, style, ...props }: React.ComponentProps<any>) => (
    <div style={{ ...style, flex: 1 }} {...props}>
      {children}
    </div>
  ),
  Text: ({ children, ...props }: React.ComponentProps<any>) => (
    <TypographyText {...props}>{children}</TypographyText>
  ),
  Title: ({ children, level = 1, ...props }: React.ComponentProps<any>) => (
    <TypographyTitle level={level} {...props}>
      {children}
    </TypographyTitle>
  ),
  Paragraph: ({ children, ...props }: React.ComponentProps<any>) => (
    <TypographyParagraph {...props}>{children}</TypographyParagraph>
  ),
  Input: (props: React.ComponentProps<any>) => <input {...props} />,
  Button: ({ children, ...props }: React.ComponentProps<any>) => (
    <button {...props}>{children}</button>
  ),
  TextArea: (props: React.ComponentProps<any>) => <textarea {...props} />,
  Image: ({ src, alt, ...props }: React.ComponentProps<any>) => (
    <img src={src} alt={alt} {...props} />
  ),
  Link: ({ children, href, ...props }: React.ComponentProps<any>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
};
