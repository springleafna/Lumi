-- CreateEnum
CREATE TYPE "DocumentMediaKind" AS ENUM ('content_image', 'cover_image');

-- CreateEnum
CREATE TYPE "DocumentMediaStatus" AS ENUM ('succeeded', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "DocumentMediaReason" AS ENUM ('storage_not_configured', 'unsupported_type', 'data_url_not_supported', 'over_limit', 'invalid_url', 'blocked_private_ip', 'redirect_blocked', 'download_timeout', 'download_failed', 'too_large', 'mime_mismatch', 'upload_failed', 'unknown');

-- CreateTable
CREATE TABLE "DocumentMediaAsset" (
    "id" TEXT NOT NULL,
    "kind" "DocumentMediaKind" NOT NULL,
    "status" "DocumentMediaStatus" NOT NULL,
    "reason" "DocumentMediaReason",
    "originalUrl" TEXT NOT NULL,
    "normalizedUrl" TEXT NOT NULL,
    "contentType" TEXT,
    "byteSize" INTEGER,
    "contentHash" TEXT,
    "objectKey" TEXT,
    "publicUrl" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "DocumentMediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentMediaAsset_documentId_kind_normalizedUrl_key" ON "DocumentMediaAsset"("documentId", "kind", "normalizedUrl");

-- CreateIndex
CREATE INDEX "DocumentMediaAsset_documentId_kind_idx" ON "DocumentMediaAsset"("documentId", "kind");

-- CreateIndex
CREATE INDEX "DocumentMediaAsset_userId_status_idx" ON "DocumentMediaAsset"("userId", "status");

-- AddForeignKey
ALTER TABLE "DocumentMediaAsset" ADD CONSTRAINT "DocumentMediaAsset_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentMediaAsset" ADD CONSTRAINT "DocumentMediaAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
