-- CreateExtension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "AiProviderTestStatus" AS ENUM ('succeeded', 'failed');

-- CreateEnum
CREATE TYPE "DocumentEmbeddingStatus" AS ENUM ('pending', 'processing', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "KnowledgeChatMessageStatus" AS ENUM ('processing', 'succeeded', 'failed', 'aborted');

-- CreateTable
CREATE TABLE "AiSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'global',
    "chatProviderPreset" TEXT,
    "chatBaseUrl" TEXT,
    "chatModel" TEXT,
    "chatApiKeyCipher" TEXT,
    "chatApiKeyIv" TEXT,
    "chatApiKeyTag" TEXT,
    "chatLastTestStatus" "AiProviderTestStatus",
    "chatLastTestError" TEXT,
    "chatLastTestedAt" TIMESTAMP(3),
    "embeddingProviderPreset" TEXT,
    "embeddingBaseUrl" TEXT,
    "embeddingModel" TEXT,
    "embeddingApiKeyCipher" TEXT,
    "embeddingApiKeyIv" TEXT,
    "embeddingApiKeyTag" TEXT,
    "embeddingDimension" INTEGER,
    "embeddingLastTestStatus" "AiProviderTestStatus",
    "embeddingLastTestError" TEXT,
    "embeddingLastTestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentEmbeddingJob" (
    "id" TEXT NOT NULL,
    "status" "DocumentEmbeddingStatus" NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "dimension" INTEGER,
    "configFingerprint" TEXT,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "DocumentEmbeddingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentEmbeddingChunk" (
    "id" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "dimension" INTEGER NOT NULL,
    "configFingerprint" TEXT NOT NULL,
    "embedding" vector NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "documentId" TEXT NOT NULL,
    "jobId" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "DocumentEmbeddingChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeChatSession" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '新的问答',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "KnowledgeChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeChatMessage" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "status" "KnowledgeChatMessageStatus" NOT NULL DEFAULT 'processing',
    "provider" TEXT,
    "model" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "KnowledgeChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeChatCitation" (
    "id" TEXT NOT NULL,
    "citationIndex" INTEGER NOT NULL,
    "excerpt" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "startOffset" INTEGER,
    "endOffset" INTEGER,
    "documentTitleSnapshot" TEXT NOT NULL,
    "documentSourceSnapshot" TEXT,
    "documentArchivedAtSnapshot" TIMESTAMP(3),
    "documentCreatedAtSnapshot" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "messageId" TEXT NOT NULL,
    "documentId" TEXT,
    "chunkId" TEXT,

    CONSTRAINT "KnowledgeChatCitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiSetting_key_key" ON "AiSetting"("key");

-- CreateIndex
CREATE INDEX "DocumentEmbeddingJob_userId_status_createdAt_idx" ON "DocumentEmbeddingJob"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentEmbeddingJob_documentId_createdAt_idx" ON "DocumentEmbeddingJob"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentEmbeddingJob_configFingerprint_idx" ON "DocumentEmbeddingJob"("configFingerprint");

-- CreateIndex
CREATE INDEX "DocumentEmbeddingChunk_userId_configFingerprint_idx" ON "DocumentEmbeddingChunk"("userId", "configFingerprint");

-- CreateIndex
CREATE INDEX "DocumentEmbeddingChunk_documentId_configFingerprint_idx" ON "DocumentEmbeddingChunk"("documentId", "configFingerprint");

-- CreateIndex
CREATE INDEX "KnowledgeChatSession_userId_deletedAt_updatedAt_idx" ON "KnowledgeChatSession"("userId", "deletedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "KnowledgeChatMessage_sessionId_createdAt_idx" ON "KnowledgeChatMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeChatMessage_userId_createdAt_idx" ON "KnowledgeChatMessage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeChatCitation_messageId_citationIndex_idx" ON "KnowledgeChatCitation"("messageId", "citationIndex");

-- CreateIndex
CREATE INDEX "KnowledgeChatCitation_documentId_idx" ON "KnowledgeChatCitation"("documentId");

-- AddForeignKey
ALTER TABLE "DocumentEmbeddingJob" ADD CONSTRAINT "DocumentEmbeddingJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentEmbeddingJob" ADD CONSTRAINT "DocumentEmbeddingJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentEmbeddingChunk" ADD CONSTRAINT "DocumentEmbeddingChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentEmbeddingChunk" ADD CONSTRAINT "DocumentEmbeddingChunk_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DocumentEmbeddingJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentEmbeddingChunk" ADD CONSTRAINT "DocumentEmbeddingChunk_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeChatSession" ADD CONSTRAINT "KnowledgeChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeChatMessage" ADD CONSTRAINT "KnowledgeChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "KnowledgeChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeChatMessage" ADD CONSTRAINT "KnowledgeChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeChatCitation" ADD CONSTRAINT "KnowledgeChatCitation_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "KnowledgeChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeChatCitation" ADD CONSTRAINT "KnowledgeChatCitation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeChatCitation" ADD CONSTRAINT "KnowledgeChatCitation_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "DocumentEmbeddingChunk"("id") ON DELETE SET NULL ON UPDATE CASCADE;
