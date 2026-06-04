-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('article', 'video', 'audio', 'pdf', 'fragment');

-- CreateEnum
CREATE TYPE "IngestJobType" AS ENUM ('url', 'html', 'selection', 'file');

-- CreateEnum
CREATE TYPE "IngestJobStatus" AS ENUM ('pending', 'processing', 'succeeded', 'failed');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL DEFAULT 'article',
    "title" TEXT NOT NULL,
    "url" TEXT,
    "source" TEXT,
    "author" TEXT,
    "excerpt" TEXT,
    "coverImage" TEXT,
    "markdown" TEXT NOT NULL,
    "contentText" TEXT,
    "wordCount" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestJob" (
    "id" TEXT NOT NULL,
    "type" "IngestJobType" NOT NULL DEFAULT 'url',
    "status" "IngestJobStatus" NOT NULL,
    "inputUrl" TEXT,
    "errorMessage" TEXT,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,

    CONSTRAINT "IngestJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Document_url_key" ON "Document"("url");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestJob" ADD CONSTRAINT "IngestJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestJob" ADD CONSTRAINT "IngestJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
