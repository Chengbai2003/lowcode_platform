/**
 * 值的深度相等性检查
 * 用于在运行时同步前检查表单值是否实际发生了变化
 */
export function deepEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) return true;

  if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) {
    return false;
  }

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) return false;

  for (const key of keys1) {
    if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) {
      return false;
    }
  }

  return true;
}

/**
 * 对象的浅相等检查。
 */
export function shallowEqual(
  obj1: Record<string, unknown> | null | undefined,
  obj2: Record<string, unknown> | null | undefined,
): boolean {
  if (obj1 === obj2) return true;

  if (!obj1 || !obj2) {
    return false;
  }

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) return false;

  for (const key of keys1) {
    if (!Object.prototype.hasOwnProperty.call(obj2, key) || !Object.is(obj1[key], obj2[key])) {
      return false;
    }
  }

  return true;
}
