/**
 * 扩展点 Actions
 */
export type CustomScriptAction = {
  type: "customScript";
  code: string;
  timeout?: number;
};

export type CustomAction = {
  type: "customAction";
  plugin: string;
  config: Record<string, any>;
};
