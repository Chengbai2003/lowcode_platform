/**
 * 不可信值的安全描述 formatter。
 *
 * 错误消息需要把非法值嵌入文本，但 String(value) / 模板插值会触发对象的
 * toString / valueOf / Symbol.toPrimitive，(obj).constructor?.name 会执行
 * 继承的 constructor getter —— 全部属于不可信代码执行。
 *
 * 本模块仅基于 typeof 生成类型级描述，对 object/function 一律不调用任何
 * 转换钩子（包括 Object.prototype.toString.call，它会读取 Symbol.toStringTag）。
 * 字符串经 JSON.stringify 转义并截断，同时防止 issue 消息体积放大。
 */
const MAX_DESCRIBED_STRING_LENGTH = 120;

function truncateDescribedString(json: string): string {
  return json.length > MAX_DESCRIBED_STRING_LENGTH
    ? `${json.slice(0, MAX_DESCRIBED_STRING_LENGTH)}…(truncated)`
    : json;
}

export function describeValue(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
      return truncateDescribedString(JSON.stringify(value));
    case 'number':
    case 'boolean':
      return `${value}`;
    case 'undefined':
      return 'undefined';
    case 'bigint':
      return 'bigint';
    case 'symbol':
      return 'symbol';
    case 'function':
      return 'function';
    case 'object':
      return 'object';
    default:
      return typeof value;
  }
}

/**
 * Symbol key 的安全描述。Symbol 是原语值，没有可注入的 own 转换钩子。
 */
export function describeSymbolKey(sym: symbol): string {
  return String(sym);
}
