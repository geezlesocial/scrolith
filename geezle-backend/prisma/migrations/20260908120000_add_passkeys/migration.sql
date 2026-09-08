-- Additive WebAuthn/passkey support. Private keys never enter this database.
CREATE TABLE IF NOT EXISTS "PasskeyCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credential_id" TEXT NOT NULL,
    "public_key" TEXT NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "transports" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "device_type" TEXT,
    "backed_up" BOOLEAN NOT NULL DEFAULT false,
    "aaguid" TEXT,
    "label" TEXT,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasskeyCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PasskeyCredential_credential_id_key"
    ON "PasskeyCredential"("credential_id");
CREATE INDEX IF NOT EXISTS "PasskeyCredential_userId_revoked_at_idx"
    ON "PasskeyCredential"("userId", "revoked_at");
CREATE INDEX IF NOT EXISTS "PasskeyCredential_last_used_at_idx"
    ON "PasskeyCredential"("last_used_at");

CREATE TABLE IF NOT EXISTS "PasskeyChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "challenge_hash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasskeyChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PasskeyChallenge_challenge_hash_key"
    ON "PasskeyChallenge"("challenge_hash");
CREATE INDEX IF NOT EXISTS "PasskeyChallenge_userId_purpose_expires_at_idx"
    ON "PasskeyChallenge"("userId", "purpose", "expires_at");
CREATE INDEX IF NOT EXISTS "PasskeyChallenge_expires_at_consumed_at_idx"
    ON "PasskeyChallenge"("expires_at", "consumed_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PasskeyCredential_userId_fkey'
  ) THEN
    ALTER TABLE "PasskeyCredential"
      ADD CONSTRAINT "PasskeyCredential_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PasskeyChallenge_userId_fkey'
  ) THEN
    ALTER TABLE "PasskeyChallenge"
      ADD CONSTRAINT "PasskeyChallenge_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
