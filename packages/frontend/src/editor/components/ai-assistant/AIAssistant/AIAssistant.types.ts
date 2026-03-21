import type { A2UISchema } from '../../../../types';
import type { AgentMessageProgress, AgentRouteInfo } from '../types/ai-types';

export interface AIMessage {
  id: string;
  type: 'user' | 'ai' | 'system';
  content: string;
  timestamp: Date;
  schema?: A2UISchema;
  suggestions?: string[];
  status?: 'loading' | 'success' | 'error';
  modelUsed?: string;
  route?: AgentRouteInfo;
  progress?: AgentMessageProgress;
  traceId?: string;
}
