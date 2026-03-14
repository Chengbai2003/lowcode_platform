/**
 * 内置组件注册表
 * 提供开箱即用的基础组件实现
 */

import React from 'react';
import type { ComponentRegistry } from './types';
import {
  Text as TypographyText,
  Title as TypographyTitle,
  Paragraph as TypographyParagraph,
} from '../components/components/Typography';

/**
 * 默认内置组件
 */
export const builtInComponents: ComponentRegistry = {
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
