/**
 * Compiler 模块
 * 提供 Schema 编译为 React 代码的功能
 */

import { Module } from '@nestjs/common';
import { CompilerController } from './compiler.controller';
import { CompilerService } from './compiler.service';

@Module({
  controllers: [CompilerController],
  providers: [CompilerService],
  exports: [CompilerService],
})
export class CompilerModule {}
