import { forwardRef, Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { QueueModule } from '../queue/queue.module';
import { EmbeddingsController } from './embeddings.controller';
import { EmbeddingsService } from './embeddings.service';

@Module({
  imports: [AuthModule, QueueModule, forwardRef(() => AiModule)],
  controllers: [EmbeddingsController],
  providers: [EmbeddingsService],
  exports: [EmbeddingsService],
})
export class EmbeddingsModule {}
