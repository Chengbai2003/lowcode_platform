/**
 * @deprecated Legacy action retained for schema compatibility.
 * In-realm customScript execution is permanently disabled.
 */
export type CustomScriptAction = {
  type: 'customScript';
  /** Legacy script source. It is never executed. */
  code: string;
  /** @deprecated Ignored because customScript is never executed. */
  timeout?: number;
};
