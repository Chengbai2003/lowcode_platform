// Layout components
export { EditorHeader } from './layout/Header/Header';
export { PreviewPane } from './layout/PreviewPane/PreviewPane';

// PropertyPanel components
export { PropertyPanel } from './PropertyPanel';

// Error handling components
export { ErrorBoundary, withErrorBoundary } from './ErrorBoundary';

// Empty state components
export {
  EmptyState,
  NoSchemaEmptyState,
  NoSelectionEmptyState,
  NoComponentsEmptyState,
  NoResultsEmptyState,
  ErrorEmptyState,
} from './EmptyState';
export type { EmptyStateProps, EmptyStateVariant, EmptyStateAction } from './EmptyState';

// TreeView components
export { ComponentTree } from './TreeView/ComponentTree';
export {
  schemaToTree,
  deleteComponent,
  copyComponent,
  moveComponent,
  moveComponentTo,
} from './TreeView/schemaToTree';
export type { TreeNodeData, ComponentTreeProps } from './TreeView/treeTypes';

// Toolbar components
export { UndoRedoButtons, useUndoRedoShortcuts } from './Toolbar';

// AI assistant components
export { AIAssistant } from './ai-assistant/AIAssistant/AIAssistant';
export { AIConfig } from './ai-assistant/AIConfig/AIConfig';
export { HistoryDrawer } from './ai-assistant/HistoryDrawer';

// TemplateGallery components
export { TemplateGallery } from './TemplateGallery/TemplateGallery';

// Export all AI types and services
export type {
  AIModelConfig,
  AIResponse,
  AIRequest,
  AIService,
  AIServiceError,
} from './ai-assistant/types/ai-types';
export { serverAIService } from './ai-assistant/api/ServerAIService';
export { aiApi } from './ai-assistant/api/ai-api';
