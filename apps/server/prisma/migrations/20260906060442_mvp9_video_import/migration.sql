-- AlterEnum
ALTER TYPE "IngestJobType" ADD VALUE 'video';

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "videoDurationSeconds" INTEGER,
ADD COLUMN     "videoPlatform" TEXT;

-- CreateTable
CREATE TABLE "VideoTranscript" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "segments" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoTranscript_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VideoTranscript_documentId_key" ON "VideoTranscript"("documentId");

-- AddForeignKey
ALTER TABLE "VideoTranscript" ADD CONSTRAINT "VideoTranscript_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
