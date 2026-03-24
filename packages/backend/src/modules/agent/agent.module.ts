import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AgentToolsModule } from '../agent-tools/agent-tools.module';
import { PageSchemaModule } from '../page-schema/page-schema.module';
import { SchemaContextModule } from '../schema-context';
import { AgentAnswerService } from './agent-answer.service';
import { AgentIdempotencyService } from './agent-idempotency.service';
import { AgentIntentClassifierService } from './agent-intent-classifier.service';
import { AgentIntentConfirmationService } from './agent-intent-confirmation.service';
import { AgentIntentNormalizationService } from './agent-intent-normalization.service';
import { AgentLegacySchemaService } from './agent-legacy-schema.service';
import { AgentMetricsService } from './agent-metrics.service';
import { AgentPolicyService } from './agent-policy.service';
import { AgentReadCacheService } from './agent-read-cache.service';
import { AgentReplayService } from './agent-replay.service';
import { AgentRoutingService } from './agent-routing.service';
import { AgentRunnerService } from './agent-runner.service';
import { AgentScopeConfirmationService } from './agent-scope-confirmation.service';
import { AgentSessionMemoryService } from './agent-session-memory.service';
import { AgentTraceService } from './agent-trace.service';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  imports: [AiModule, PageSchemaModule, SchemaContextModule, AgentToolsModule],
  controllers: [AgentController],
  providers: [
    AgentService,
    AgentAnswerService,
    AgentIdempotencyService,
    AgentIntentClassifierService,
    AgentIntentConfirmationService,
    AgentIntentNormalizationService,
    AgentLegacySchemaService,
    AgentMetricsService,
    AgentPolicyService,
    AgentReadCacheService,
    AgentReplayService,
    AgentRoutingService,
    AgentRunnerService,
    AgentScopeConfirmationService,
    AgentSessionMemoryService,
    AgentTraceService,
  ],
  exports: [AgentService],
})
export class AgentModule {}
