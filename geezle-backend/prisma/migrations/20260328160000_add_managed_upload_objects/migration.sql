CREATE TABLE "managed_upload_objects" (
    "id" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL DEFAULT 0,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "managed_upload_objects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "managed_upload_objects_object_key_key" ON "managed_upload_objects"("object_key");
CREATE INDEX "managed_upload_objects_created_at_idx" ON "managed_upload_objects"("created_at");
