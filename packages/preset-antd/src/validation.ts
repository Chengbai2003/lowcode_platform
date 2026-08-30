/**
 * @lowcode-platform/preset-antd/validation
 *
 * AntD Preset 的组件级 Validation 钩子（Issue #19 / M0-4 Scope B）。
 *
 * Manifest 白名单之后执行的第二道净化：对可指向任意协议的
 * 资源类 Props（Link.href / Image.src）做危险 scheme 检查，
 * 命中即移除该 Prop（fail-close，组件按缺省行为渲染）。
 */

import type {
  ComponentPropsValidator,
  ComponentValidationRegistry,
} from '@lowcode-platform/renderer';

/**
 * 危险 URL scheme 黑名单：javascript / vbscript / file / about，
 * 以及非图片类 data: URL。正常相对路径与 http(s) 一律放行。
 */
const UNSAFE_RESOURCE_SCHEME = /^\s*(?:(?:javascript|vbscript|file|about):|data:(?!image\/))/i;

function sanitizeResourceProp(
  props: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const value = props[key];
  if (typeof value !== 'string') {
    return props;
  }
  if (UNSAFE_RESOURCE_SCHEME.test(value)) {
    const { [key]: _removed, ...rest } = props;
    return rest;
  }
  return props;
}

const sanitizeHref: ComponentPropsValidator = (props) => sanitizeResourceProp(props, 'href');
const sanitizeSrc: ComponentPropsValidator = (props) => sanitizeResourceProp(props, 'src');

export const antdValidation: ComponentValidationRegistry = Object.freeze({
  Link: sanitizeHref,
  Image: sanitizeSrc,
});

/** 供测试与宿主复用的危险 scheme 判定 */
export function isUnsafeResourceUrl(value: unknown): boolean {
  return typeof value === 'string' && UNSAFE_RESOURCE_SCHEME.test(value);
}
