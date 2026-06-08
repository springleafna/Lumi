UPDATE "Document" d
SET "source" = '本地'
WHERE d."source" IS NULL
  AND d."url" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "IngestJob" j
    WHERE j."documentId" = d."id"
      AND j."type" = 'file'
  );
