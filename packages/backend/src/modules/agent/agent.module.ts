import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { PageSchemaModule } from '../page-schema/page-schema.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  imports: [AiModule, PageSchemaModule],
  controllers: [AgentController],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
