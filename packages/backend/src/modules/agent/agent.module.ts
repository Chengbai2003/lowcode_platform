import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AgentToolsModule } from '../agent-tools/agent-tools.module';
import { PageSchemaModule } from '../page-schema/page-schema.module';
import { SchemaContextModule } from '../schema-context';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  imports: [AiModule, PageSchemaModule, SchemaContextModule, AgentToolsModule],
  controllers: [AgentController],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
