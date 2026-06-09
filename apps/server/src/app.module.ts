import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { DocumentsModule } from './documents/documents.module';
import { EmbeddingsModule } from './embeddings/embeddings.module';
import { IngestModule } from './ingest/ingest.module';
import { KnowledgeChatModule } from './knowledge-chat/knowledge-chat.module';
import { PrismaModule } from './prisma/prisma.module';
import { SettingsModule } from './settings/settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    PrismaModule,
    AuthModule,
    DocumentsModule,
    IngestModule,
    AiModule,
    SettingsModule,
    EmbeddingsModule,
    KnowledgeChatModule,
  ],
})
export class AppModule {}
