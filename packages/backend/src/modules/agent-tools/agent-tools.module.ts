import { Module } from '@nestjs/common';
import { SchemaContextModule } from '../schema-context';
import { PageSchemaModule } from '../page-schema/page-schema.module';
import { PatchApplyService } from './patch-apply.service';
import { PatchAutoFixService } from './patch-auto-fix.service';
import { PatchValidationService } from './patch-validation.service';
import { ToolExecutionService } from './tool-execution.service';
import { ToolRegistryService } from './tool-registry.service';

@Module({
  imports: [PageSchemaModule, SchemaContextModule],
  providers: [
    PatchApplyService,
    PatchAutoFixService,
    PatchValidationService,
    ToolRegistryService,
    ToolExecutionService,
  ],
  exports: [
    PatchApplyService,
    PatchAutoFixService,
    PatchValidationService,
    ToolRegistryService,
    ToolExecutionService,
  ],
})
export class AgentToolsModule {}
