-- CreateTable
CREATE TABLE IF NOT EXISTS "ScrollVideo" (
  "id" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "fileId" TEXT NOT NULL,
  "title" TEXT,
  "description" TEXT,
  "location" TEXT,
  "visibility" TEXT NOT NULL DEFAULT 'public',
  "isAIEnhanced" BOOLEAN NOT NULL DEFAULT false,
  "filterPreset" TEXT DEFAULT 'none',
  "filterStrength" DOUBLE PRECISION,
  "status" TEXT NOT NULL DEFAULT 'active',
  "impressions" INTEGER NOT NULL DEFAULT 0,
  "views3s" INTEGER NOT NULL DEFAULT 0,
  "views10s" INTEGER NOT NULL DEFAULT 0,
  "views25pct" INTEGER NOT NULL DEFAULT 0,
  "views50pct" INTEGER NOT NULL DEFAULT 0,
  "views95pct" INTEGER NOT NULL DEFAULT 0,
  "likesCount" INTEGER NOT NULL DEFAULT 0,
  "commentsCount" INTEGER NOT NULL DEFAULT 0,
  "repostsCount" INTEGER NOT NULL DEFAULT 0,
  "sharesCount" INTEGER NOT NULL DEFAULT 0,
  "sendCount" INTEGER NOT NULL DEFAULT 0,
  "lastImpressionIncrementAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ScrollVideo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ScrollTag" (
  "id" TEXT NOT NULL,
  "scrollId" TEXT NOT NULL,
  "taggedUserId" TEXT,
  "taggedPageId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ScrollTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ScrollEngagement" (
  "id" TEXT NOT NULL,
  "scrollId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ScrollEngagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ScrollReport" (
  "id" TEXT NOT NULL,
  "scrollId" TEXT NOT NULL,
  "reportedById" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  "reviewNote" TEXT,

  CONSTRAINT "ScrollReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ScrollConfig" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "maxDurationSeconds" INTEGER NOT NULL DEFAULT 90,
  "aiLabelRequired" BOOLEAN NOT NULL DEFAULT false,
  "autoModeration" BOOLEAN NOT NULL DEFAULT false,
  "monetizationEnabled" BOOLEAN NOT NULL DEFAULT true,
  "defaultVisibility" TEXT NOT NULL DEFAULT 'public',
  "impressionThresholdSeconds" INTEGER NOT NULL DEFAULT 2,
  "allowedFilterPresets" TEXT[] NOT NULL DEFAULT ARRAY['none','vibrant','cinematic','bw','sepia','warm']::TEXT[],
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ScrollConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ScrollVideo_authorId_createdAt_idx" ON "ScrollVideo"("authorId", "createdAt");
CREATE INDEX IF NOT EXISTS "ScrollVideo_visibility_status_createdAt_idx" ON "ScrollVideo"("visibility", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "ScrollVideo_fileId_idx" ON "ScrollVideo"("fileId");
CREATE INDEX IF NOT EXISTS "ScrollTag_scrollId_idx" ON "ScrollTag"("scrollId");
CREATE INDEX IF NOT EXISTS "ScrollTag_taggedUserId_idx" ON "ScrollTag"("taggedUserId");
CREATE INDEX IF NOT EXISTS "ScrollTag_taggedPageId_idx" ON "ScrollTag"("taggedPageId");
CREATE UNIQUE INDEX IF NOT EXISTS "ScrollEngagement_scrollId_userId_type_key" ON "ScrollEngagement"("scrollId", "userId", "type");
CREATE INDEX IF NOT EXISTS "ScrollEngagement_scrollId_createdAt_idx" ON "ScrollEngagement"("scrollId", "createdAt");
CREATE INDEX IF NOT EXISTS "ScrollEngagement_userId_createdAt_idx" ON "ScrollEngagement"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ScrollEngagement_type_createdAt_idx" ON "ScrollEngagement"("type", "createdAt");
CREATE INDEX IF NOT EXISTS "ScrollReport_scrollId_status_createdAt_idx" ON "ScrollReport"("scrollId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "ScrollReport_reportedById_createdAt_idx" ON "ScrollReport"("reportedById", "createdAt");
CREATE INDEX IF NOT EXISTS "ScrollReport_status_createdAt_idx" ON "ScrollReport"("status", "createdAt");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ScrollTag" ADD CONSTRAINT "ScrollTag_scrollId_fkey"
    FOREIGN KEY ("scrollId") REFERENCES "ScrollVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ScrollEngagement" ADD CONSTRAINT "ScrollEngagement_scrollId_fkey"
    FOREIGN KEY ("scrollId") REFERENCES "ScrollVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ScrollReport" ADD CONSTRAINT "ScrollReport_scrollId_fkey"
    FOREIGN KEY ("scrollId") REFERENCES "ScrollVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
