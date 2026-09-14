-- AlterTable
ALTER TABLE "DocumentEmbeddingChunk" ADD COLUMN     "endSeconds" INTEGER,
ADD COLUMN     "startSeconds" INTEGER;

-- AlterTable
ALTER TABLE "KnowledgeChatCitation" ADD COLUMN     "endSeconds" INTEGER,
ADD COLUMN     "startSeconds" INTEGER;
