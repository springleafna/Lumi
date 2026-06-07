-- CreateEnum
CREATE TYPE "DocumentIngestStatus" AS ENUM ('pending', 'processing', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "AiAnalysisStatus" AS ENUM ('pending', 'processing', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "AiConversationStatus" AS ENUM ('processing', 'succeeded', 'failed');

-- AlterTable
ALTER TABLE "Document"
ADD COLUMN "ingestStatus" "DocumentIngestStatus" NOT NULL DEFAULT 'succeeded',
ADD COLUMN "ingestErrorMessage" TEXT;

-- AlterTable
ALTER TABLE "IngestJob"
ADD COLUMN "inputTitle" TEXT,
ADD COLUMN "inputHtml" TEXT;

-- CreateTable
CREATE TABLE "AiAnalysis" (
    "id" TEXT NOT NULL,
    "status" "AiAnalysisStatus" NOT NULL DEFAULT 'pending',
    "provider" TEXT,
    "model" TEXT,
    "language" TEXT NOT NULL DEFAULT 'zh-CN',
    "oneSentenceSummary" TEXT,
    "summary" TEXT,
    "keyPoints" JSONB,
    "concepts" JSONB,
    "actions" JSONB,
    "audience" TEXT,
    "suggestedTags" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "AiAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiConversation" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "citations" JSONB,
    "status" "AiConversationStatus" NOT NULL DEFAULT 'processing',
    "provider" TEXT,
    "model" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Document_userId_ingestStatus_idx" ON "Document"("userId", "ingestStatus");

-- CreateIndex
CREATE INDEX "AiAnalysis_userId_idx" ON "AiAnalysis"("userId");

-- CreateIndex
CREATE INDEX "AiAnalysis_status_idx" ON "AiAnalysis"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AiAnalysis_documentId_key" ON "AiAnalysis"("documentId");

-- CreateIndex
CREATE INDEX "AiConversation_documentId_createdAt_idx" ON "AiConversation"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "AiConversation_userId_idx" ON "AiConversation"("userId");

-- AddForeignKey
ALTER TABLE "AiAnalysis" ADD CONSTRAINT "AiAnalysis_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAnalysis" ADD CONSTRAINT "AiAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
