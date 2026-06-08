-- CreateEnum
CREATE TYPE "DocumentReadingStatus" AS ENUM ('unread', 'reading', 'read');

-- AlterTable
ALTER TABLE "Document"
ADD COLUMN "readingStatus" "DocumentReadingStatus" NOT NULL DEFAULT 'unread',
ADD COLUMN "favoritedAt" TIMESTAMP(3);

-- DropIndex
DROP INDEX IF EXISTS "Document_url_key";

-- CreateTable
CREATE TABLE "Annotation" (
    "id" TEXT NOT NULL,
    "selectedText" TEXT NOT NULL,
    "note" TEXT,
    "prefix" TEXT,
    "suffix" TEXT,
    "occurrenceIndex" INTEGER NOT NULL DEFAULT 0,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Annotation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Annotation_documentId_startOffset_idx" ON "Annotation"("documentId", "startOffset");

-- CreateIndex
CREATE INDEX "Annotation_userId_idx" ON "Annotation"("userId");

-- CreateIndex
CREATE INDEX "Document_userId_url_idx" ON "Document"("userId", "url");

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
