import React from 'react';
import { Typography as AntTypography } from 'antd';

/**
 * 排版组件
 *
 * M0-4 Scope A 阶段随 builtInComponents 进入 Renderer 包；
 * Scope B（M0-4b）将把本文件与 builtInComponents 一起迁往 @lowcode-platform/preset-antd。
 */
export const Typography = AntTypography;

// 创建 Text、Title、Paragraph 的包装组件
// 确保它们作为 React 组件正常工作
export const Text = (props: React.ComponentProps<typeof AntTypography.Text>) => (
  <AntTypography.Text {...props} />
);

export const Title = (props: React.ComponentProps<typeof AntTypography.Title>) => (
  <AntTypography.Title {...props} />
);

export const Paragraph = (props: React.ComponentProps<typeof AntTypography.Paragraph>) => (
  <AntTypography.Paragraph {...props} />
);

export default Typography;
