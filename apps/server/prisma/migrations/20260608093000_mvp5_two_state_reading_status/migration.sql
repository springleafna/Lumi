-- Convert MVP5 reading status from unread/reading/read to unread/read.
UPDATE "Document"
SET "readingStatus" = 'read'::"DocumentReadingStatus"
WHERE "readingStatus" = 'reading'::"DocumentReadingStatus";

ALTER TABLE "Document" ALTER COLUMN "readingStatus" DROP DEFAULT;
ALTER TYPE "DocumentReadingStatus" RENAME TO "DocumentReadingStatus_old";
CREATE TYPE "DocumentReadingStatus" AS ENUM ('unread', 'read');
ALTER TABLE "Document"
ALTER COLUMN "readingStatus" TYPE "DocumentReadingStatus"
USING "readingStatus"::text::"DocumentReadingStatus";
ALTER TABLE "Document" ALTER COLUMN "readingStatus" SET DEFAULT 'unread';
DROP TYPE "DocumentReadingStatus_old";
