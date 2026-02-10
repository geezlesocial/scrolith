-- AlterTable
ALTER TABLE "CommunityAd" ADD COLUMN     "adminReviewNotes" TEXT,
ADD COLUMN     "cpc" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "ctaText" TEXT,
ADD COLUMN     "destinationType" TEXT NOT NULL DEFAULT 'url',
ADD COLUMN     "destinationUrl" TEXT,
ADD COLUMN     "durationDays" INTEGER,
ADD COLUMN     "likes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "messagesStarted" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "objective" TEXT NOT NULL DEFAULT 'traffic';

-- AlterTable
ALTER TABLE "CommunityPost" ADD COLUMN     "businessPageId" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "mentions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "originalPostId" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "topic" TEXT,
ADD COLUMN     "visibility" TEXT NOT NULL DEFAULT 'public';

-- AlterTable
ALTER TABLE "Gig" ADD COLUMN     "adminReason" TEXT;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "adminReason" TEXT;

-- CreateTable
CREATE TABLE "FileUsage" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "usageType" TEXT NOT NULL,
    "usageId" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityPostComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "parentId" TEXT,
    "content" TEXT NOT NULL,
    "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityPostComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityPostReaction" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityPostReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityStory" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "content" TEXT,
    "mediaFileId" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'public',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityStory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityStoryView" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "viewerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityStoryView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityBusinessPage" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "tagline" TEXT,
    "description" TEXT,
    "website" TEXT,
    "industry" TEXT,
    "orgSize" TEXT,
    "orgType" TEXT,
    "location" TEXT,
    "logoFileId" TEXT,
    "coverFileId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityBusinessPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityBusinessPageFollower" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityBusinessPageFollower_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityBusinessPageAdmin" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityBusinessPageAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FileUsage_fileId_idx" ON "FileUsage"("fileId");

-- CreateIndex
CREATE INDEX "FileUsage_usageType_usageId_idx" ON "FileUsage"("usageType", "usageId");

-- CreateIndex
CREATE UNIQUE INDEX "FileUsage_fileId_usageType_usageId_key" ON "FileUsage"("fileId", "usageType", "usageId");

-- CreateIndex
CREATE INDEX "CommunityPostComment_postId_idx" ON "CommunityPostComment"("postId");

-- CreateIndex
CREATE INDEX "CommunityPostComment_authorId_idx" ON "CommunityPostComment"("authorId");

-- CreateIndex
CREATE INDEX "CommunityPostComment_parentId_idx" ON "CommunityPostComment"("parentId");

-- CreateIndex
CREATE INDEX "CommunityPostReaction_postId_idx" ON "CommunityPostReaction"("postId");

-- CreateIndex
CREATE INDEX "CommunityPostReaction_userId_idx" ON "CommunityPostReaction"("userId");

-- CreateIndex
CREATE INDEX "CommunityPostReaction_type_idx" ON "CommunityPostReaction"("type");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityPostReaction_postId_userId_key" ON "CommunityPostReaction"("postId", "userId");

-- CreateIndex
CREATE INDEX "CommunityStory_authorId_idx" ON "CommunityStory"("authorId");

-- CreateIndex
CREATE INDEX "CommunityStory_expiresAt_idx" ON "CommunityStory"("expiresAt");

-- CreateIndex
CREATE INDEX "CommunityStory_visibility_idx" ON "CommunityStory"("visibility");

-- CreateIndex
CREATE INDEX "CommunityStoryView_storyId_idx" ON "CommunityStoryView"("storyId");

-- CreateIndex
CREATE INDEX "CommunityStoryView_viewerId_idx" ON "CommunityStoryView"("viewerId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityStoryView_storyId_viewerId_key" ON "CommunityStoryView"("storyId", "viewerId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityBusinessPage_handle_key" ON "CommunityBusinessPage"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityBusinessPage_slug_key" ON "CommunityBusinessPage"("slug");

-- CreateIndex
CREATE INDEX "CommunityBusinessPage_ownerId_idx" ON "CommunityBusinessPage"("ownerId");

-- CreateIndex
CREATE INDEX "CommunityBusinessPageFollower_pageId_idx" ON "CommunityBusinessPageFollower"("pageId");

-- CreateIndex
CREATE INDEX "CommunityBusinessPageFollower_userId_idx" ON "CommunityBusinessPageFollower"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityBusinessPageFollower_pageId_userId_key" ON "CommunityBusinessPageFollower"("pageId", "userId");

-- CreateIndex
CREATE INDEX "CommunityBusinessPageAdmin_pageId_idx" ON "CommunityBusinessPageAdmin"("pageId");

-- CreateIndex
CREATE INDEX "CommunityBusinessPageAdmin_userId_idx" ON "CommunityBusinessPageAdmin"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityBusinessPageAdmin_pageId_userId_key" ON "CommunityBusinessPageAdmin"("pageId", "userId");

-- CreateIndex
CREATE INDEX "CommunityPost_businessPageId_idx" ON "CommunityPost"("businessPageId");

-- CreateIndex
CREATE INDEX "CommunityPost_visibility_idx" ON "CommunityPost"("visibility");

-- CreateIndex
CREATE INDEX "CommunityPost_topic_idx" ON "CommunityPost"("topic");

-- CreateIndex
CREATE INDEX "CommunityPost_location_idx" ON "CommunityPost"("location");

-- AddForeignKey
ALTER TABLE "FileUsage" ADD CONSTRAINT "FileUsage_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_businessPageId_fkey" FOREIGN KEY ("businessPageId") REFERENCES "CommunityBusinessPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_originalPostId_fkey" FOREIGN KEY ("originalPostId") REFERENCES "CommunityPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPostComment" ADD CONSTRAINT "CommunityPostComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPostComment" ADD CONSTRAINT "CommunityPostComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPostComment" ADD CONSTRAINT "CommunityPostComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CommunityPostComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPostReaction" ADD CONSTRAINT "CommunityPostReaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPostReaction" ADD CONSTRAINT "CommunityPostReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityStory" ADD CONSTRAINT "CommunityStory_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityStoryView" ADD CONSTRAINT "CommunityStoryView_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "CommunityStory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityStoryView" ADD CONSTRAINT "CommunityStoryView_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityBusinessPage" ADD CONSTRAINT "CommunityBusinessPage_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityBusinessPageFollower" ADD CONSTRAINT "CommunityBusinessPageFollower_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "CommunityBusinessPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityBusinessPageFollower" ADD CONSTRAINT "CommunityBusinessPageFollower_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityBusinessPageAdmin" ADD CONSTRAINT "CommunityBusinessPageAdmin_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "CommunityBusinessPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityBusinessPageAdmin" ADD CONSTRAINT "CommunityBusinessPageAdmin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
