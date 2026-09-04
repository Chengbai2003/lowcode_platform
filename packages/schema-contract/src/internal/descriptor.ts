export function isPlainPrototype(obj: object): boolean {
  const proto = Object.getPrototypeOf(obj);
  return proto === Object.prototype || proto === null;
}

export function safeGet(
  obj: object,
  key: string,
): { exists: boolean; isAccessor: boolean; value: unknown } {
  const desc = Object.getOwnPropertyDescriptor(obj, key);
  if (!desc) return { exists: false, isAccessor: false, value: undefined };
  if (desc.get || desc.set) return { exists: true, isAccessor: true, value: undefined };
  return { exists: true, isAccessor: false, value: (desc as PropertyDescriptor).value };
}
