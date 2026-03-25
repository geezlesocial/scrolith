CREATE TABLE "Topic" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'general',
  "status" TEXT NOT NULL DEFAULT 'active',
  "description" TEXT,
  "followerCount" INTEGER NOT NULL DEFAULT 0,
  "usageCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TopicAlias" (
  "id" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "alias" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TopicAlias_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TopicFollow" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TopicFollow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeedIntentSignal" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "signal" TEXT NOT NULL,
  "surface" TEXT NOT NULL DEFAULT 'community_feed',
  "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FeedIntentSignal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SavedPipelineItem" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "sourceSurface" TEXT NOT NULL DEFAULT 'member_home',
  "note" TEXT,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SavedPipelineItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Topic_slug_key" ON "Topic"("slug");
CREATE UNIQUE INDEX "TopicAlias_topicId_alias_key" ON "TopicAlias"("topicId", "alias");
CREATE UNIQUE INDEX "TopicFollow_userId_topicId_key" ON "TopicFollow"("userId", "topicId");
CREATE UNIQUE INDEX "SavedPipelineItem_userId_entityType_entityId_key" ON "SavedPipelineItem"("userId", "entityType", "entityId");

CREATE INDEX "Topic_label_idx" ON "Topic"("label");
CREATE INDEX "Topic_kind_status_idx" ON "Topic"("kind", "status");
CREATE INDEX "TopicAlias_alias_idx" ON "TopicAlias"("alias");
CREATE INDEX "TopicFollow_userId_createdAt_idx" ON "TopicFollow"("userId", "createdAt");
CREATE INDEX "TopicFollow_topicId_createdAt_idx" ON "TopicFollow"("topicId", "createdAt");
CREATE INDEX "FeedIntentSignal_userId_createdAt_idx" ON "FeedIntentSignal"("userId", "createdAt");
CREATE INDEX "FeedIntentSignal_entityType_entityId_createdAt_idx" ON "FeedIntentSignal"("entityType", "entityId", "createdAt");
CREATE INDEX "FeedIntentSignal_signal_createdAt_idx" ON "FeedIntentSignal"("signal", "createdAt");
CREATE INDEX "SavedPipelineItem_userId_createdAt_idx" ON "SavedPipelineItem"("userId", "createdAt");
CREATE INDEX "SavedPipelineItem_entityType_entityId_idx" ON "SavedPipelineItem"("entityType", "entityId");

ALTER TABLE "TopicAlias"
ADD CONSTRAINT "TopicAlias_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TopicFollow"
ADD CONSTRAINT "TopicFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TopicFollow"
ADD CONSTRAINT "TopicFollow_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeedIntentSignal"
ADD CONSTRAINT "FeedIntentSignal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SavedPipelineItem"
ADD CONSTRAINT "SavedPipelineItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
