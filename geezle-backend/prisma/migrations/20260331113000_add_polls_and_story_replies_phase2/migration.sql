-- Add story reply chains plus community polls / versus cards for member_home engagement.

CREATE TABLE "CommunityStoryReply" (
  "id" TEXT NOT NULL,
  "storyId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "parentId" TEXT,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CommunityStoryReply_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommunityPoll" (
  "id" TEXT NOT NULL,
  "creatorUserId" TEXT,
  "key" TEXT,
  "title" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'poll',
  "status" TEXT NOT NULL DEFAULT 'active',
  "sourceScope" TEXT NOT NULL DEFAULT 'member_home',
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CommunityPoll_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommunityPollOption" (
  "id" TEXT NOT NULL,
  "pollId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "accent" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CommunityPollOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommunityPollVote" (
  "id" TEXT NOT NULL,
  "pollId" TEXT NOT NULL,
  "optionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CommunityPollVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommunityPollOption_pollId_position_key" ON "CommunityPollOption"("pollId", "position");
CREATE UNIQUE INDEX "CommunityPoll_key_key" ON "CommunityPoll"("key");
CREATE UNIQUE INDEX "CommunityPollVote_pollId_userId_key" ON "CommunityPollVote"("pollId", "userId");

CREATE INDEX "CommunityStoryReply_storyId_createdAt_idx" ON "CommunityStoryReply"("storyId", "createdAt");
CREATE INDEX "CommunityStoryReply_authorId_createdAt_idx" ON "CommunityStoryReply"("authorId", "createdAt");
CREATE INDEX "CommunityStoryReply_parentId_createdAt_idx" ON "CommunityStoryReply"("parentId", "createdAt");
CREATE INDEX "CommunityPoll_creatorUserId_createdAt_idx" ON "CommunityPoll"("creatorUserId", "createdAt");
CREATE INDEX "CommunityPoll_status_createdAt_idx" ON "CommunityPoll"("status", "createdAt");
CREATE INDEX "CommunityPoll_sourceScope_status_createdAt_idx" ON "CommunityPoll"("sourceScope", "status", "createdAt");
CREATE INDEX "CommunityPollOption_pollId_idx" ON "CommunityPollOption"("pollId");
CREATE INDEX "CommunityPollVote_optionId_idx" ON "CommunityPollVote"("optionId");
CREATE INDEX "CommunityPollVote_userId_createdAt_idx" ON "CommunityPollVote"("userId", "createdAt");

ALTER TABLE "CommunityStoryReply"
ADD CONSTRAINT "CommunityStoryReply_storyId_fkey"
FOREIGN KEY ("storyId") REFERENCES "CommunityStory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CommunityStoryReply"
ADD CONSTRAINT "CommunityStoryReply_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CommunityStoryReply"
ADD CONSTRAINT "CommunityStoryReply_parentId_fkey"
FOREIGN KEY ("parentId") REFERENCES "CommunityStoryReply"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CommunityPoll"
ADD CONSTRAINT "CommunityPoll_creatorUserId_fkey"
FOREIGN KEY ("creatorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CommunityPollOption"
ADD CONSTRAINT "CommunityPollOption_pollId_fkey"
FOREIGN KEY ("pollId") REFERENCES "CommunityPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CommunityPollVote"
ADD CONSTRAINT "CommunityPollVote_pollId_fkey"
FOREIGN KEY ("pollId") REFERENCES "CommunityPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CommunityPollVote"
ADD CONSTRAINT "CommunityPollVote_optionId_fkey"
FOREIGN KEY ("optionId") REFERENCES "CommunityPollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CommunityPollVote"
ADD CONSTRAINT "CommunityPollVote_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
