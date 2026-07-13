-- Phase 3A: additive file processing status + file_variants table
-- Safe / backward compatible. Does not remove or rename existing columns.

-- CreateEnum
CREATE TYPE "FileProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'PARTIAL', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "FileVariantStatus" AS ENUM ('READY', 'FAILED');

-- AlterTable
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "processing_status" "FileProcessingStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "processing_version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "processing_error_code" TEXT;
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "processing_started_at" TIMESTAMP(3);
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "processing_completed_at" TIMESTAMP(3);
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "variants_manifest" JSONB;

-- CreateTable
CREATE TABLE IF NOT EXISTS "file_variants" (
    "id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'default',
    "width" INTEGER,
    "height" INTEGER,
    "format" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "storage_provider" TEXT NOT NULL DEFAULT 'google_cloud_storage',
    "storage_key" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL DEFAULT 0,
    "checksum" TEXT,
    "status" "FileVariantStatus" NOT NULL DEFAULT 'READY',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "file_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "files_processing_status_idx" ON "files"("processing_status");

CREATE UNIQUE INDEX IF NOT EXISTS "file_variants_storage_key_key" ON "file_variants"("storage_key");

CREATE INDEX IF NOT EXISTS "file_variants_file_id_idx" ON "file_variants"("file_id");

CREATE INDEX IF NOT EXISTS "file_variants_status_idx" ON "file_variants"("status");

CREATE UNIQUE INDEX IF NOT EXISTS "file_variants_file_id_kind_width_format_label_key" ON "file_variants"("file_id", "kind", "width", "format", "label");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'file_variants_file_id_fkey'
  ) THEN
    ALTER TABLE "file_variants"
      ADD CONSTRAINT "file_variants_file_id_fkey"
      FOREIGN KEY ("file_id") REFERENCES "files"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
