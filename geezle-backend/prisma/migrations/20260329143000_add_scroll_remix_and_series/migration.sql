-- Add Scroll remix/duet source linkage and reusable creator series/playlists.

ALTER TABLE "ScrollVideo"
ADD COLUMN "sourceScrollId" TEXT,
ADD COLUMN "responseMode" TEXT;

CREATE TABLE "ScrollSeries" (
  "id" TEXT NOT NULL,
  "creatorUserId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "visibility" TEXT NOT NULL DEFAULT 'public',
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ScrollSeries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScrollSeriesItem" (
  "id" TEXT NOT NULL,
  "seriesId" TEXT NOT NULL,
  "scrollId" TEXT NOT NULL,
  "addedByUserId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ScrollSeriesItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScrollSeriesItem_seriesId_scrollId_key"
ON "ScrollSeriesItem"("seriesId", "scrollId");

CREATE UNIQUE INDEX "ScrollSeriesItem_seriesId_position_key"
ON "ScrollSeriesItem"("seriesId", "position");

CREATE INDEX "ScrollVideo_sourceScrollId_createdAt_idx"
ON "ScrollVideo"("sourceScrollId", "createdAt");

CREATE INDEX "ScrollVideo_responseMode_createdAt_idx"
ON "ScrollVideo"("responseMode", "createdAt");

CREATE INDEX "ScrollSeries_creatorUserId_createdAt_idx"
ON "ScrollSeries"("creatorUserId", "createdAt");

CREATE INDEX "ScrollSeries_creatorUserId_status_createdAt_idx"
ON "ScrollSeries"("creatorUserId", "status", "createdAt");

CREATE INDEX "ScrollSeries_visibility_status_createdAt_idx"
ON "ScrollSeries"("visibility", "status", "createdAt");

CREATE INDEX "ScrollSeriesItem_scrollId_idx"
ON "ScrollSeriesItem"("scrollId");

CREATE INDEX "ScrollSeriesItem_addedByUserId_createdAt_idx"
ON "ScrollSeriesItem"("addedByUserId", "createdAt");

ALTER TABLE "ScrollVideo"
ADD CONSTRAINT "ScrollVideo_sourceScrollId_fkey"
FOREIGN KEY ("sourceScrollId") REFERENCES "ScrollVideo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ScrollSeries"
ADD CONSTRAINT "ScrollSeries_creatorUserId_fkey"
FOREIGN KEY ("creatorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScrollSeriesItem"
ADD CONSTRAINT "ScrollSeriesItem_seriesId_fkey"
FOREIGN KEY ("seriesId") REFERENCES "ScrollSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScrollSeriesItem"
ADD CONSTRAINT "ScrollSeriesItem_scrollId_fkey"
FOREIGN KEY ("scrollId") REFERENCES "ScrollVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScrollSeriesItem"
ADD CONSTRAINT "ScrollSeriesItem_addedByUserId_fkey"
FOREIGN KEY ("addedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
