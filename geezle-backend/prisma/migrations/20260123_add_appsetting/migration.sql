-- Migration: add AppSetting table to store scoped JSON settings
CREATE TABLE IF NOT EXISTS "AppSetting" (
  "id" TEXT PRIMARY KEY,
  "scope" TEXT NOT NULL UNIQUE,
  "data" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- trigger to update updatedAt on row modification
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_trigger ON "AppSetting";
CREATE TRIGGER set_updated_at_trigger
BEFORE UPDATE ON "AppSetting"
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();
