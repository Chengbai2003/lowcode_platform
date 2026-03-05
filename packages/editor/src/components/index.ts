// Layout components
export { EditorHeader } from "./layout/Header/Header";
export { ActivityBar } from "./layout/ActivityBar/ActivityBar";
export { PreviewPane } from "./layout/PreviewPane/PreviewPane";

// Editor pane components
export { EditorPane } from "./editor-pane/EditorPane";

// TreeView components
export { ComponentTree } from "./TreeView/ComponentTree";
export {
  schemaToTree,
  deleteComponent,
  copyComponent,
  moveComponent,
  moveComponentTo,
} from "./TreeView/schemaToTree";
export type { TreeNodeData, ComponentTreeProps } from "./TreeView/treeTypes";

// AI assistant components
export { AIAssistant } from "./ai-assistant/AIAssistant/AIAssistant";
export { AIConfig } from "./ai-assistant/AIConfig/AIConfig";

// Export all AI types and services
export type {
  AIModelConfig,
  AIResponse,
  AIRequest,
  AIService,
  AIServiceError,
} from "./ai-assistant/types/ai-types";
export { serverAIService } from "./ai-assistant/api/ServerAIService";
export { aiApi } from "./ai-assistant/api/ai-api";
