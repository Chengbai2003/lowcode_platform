/**
 * 递归深冻结任意对象与数组
 */
export function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Object.isFrozen(obj)) {
    return obj;
  }

  Object.freeze(obj);

  const propNames = Object.getOwnPropertyNames(obj);
  for (const key of propNames) {
    const desc = Object.getOwnPropertyDescriptor(obj, key);
    if (desc && 'value' in desc) {
      const val = desc.value;
      if (val !== null && typeof val === 'object') {
        deepFreeze(val);
      }
    }
  }
  const symbols = Object.getOwnPropertySymbols(obj);
  for (const sym of symbols) {
    const desc = Object.getOwnPropertyDescriptor(obj, sym);
    if (desc && 'value' in desc && desc.value !== null && typeof desc.value === 'object') {
      deepFreeze(desc.value);
    }
  }

  return obj;
}
