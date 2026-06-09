import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { KnowledgeChatController } from './knowledge-chat.controller';
import { KnowledgeChatService } from './knowledge-chat.service';

@Module({
  imports: [AuthModule, AiModule, EmbeddingsModule],
  controllers: [KnowledgeChatController],
  providers: [KnowledgeChatService],
})
export class KnowledgeChatModule {}
