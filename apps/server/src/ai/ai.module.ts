import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { QueueModule } from '../queue/queue.module';
import { AiController } from './ai.controller';
import { AiProviderService } from './ai-provider.service';
import { AiService } from './ai.service';

@Module({
  imports: [AuthModule, QueueModule],
  controllers: [AiController],
  providers: [AiProviderService, AiService],
  exports: [AiProviderService, AiService],
})
export class AiModule {}
