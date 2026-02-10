-- AlterTable
ALTER TABLE "CommunityPost" ADD COLUMN     "commentPolicy" TEXT NOT NULL DEFAULT 'everyone',
ADD COLUMN     "isHighlighted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CommunityPostComment" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';

-- CreateTable
CREATE TABLE "CommunityPostCommentLike" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityPostCommentLike_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunityPostCommentLike_commentId_idx" ON "CommunityPostCommentLike"("commentId");

-- CreateIndex
CREATE INDEX "CommunityPostCommentLike_userId_idx" ON "CommunityPostCommentLike"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityPostCommentLike_commentId_userId_key" ON "CommunityPostCommentLike"("commentId", "userId");

-- CreateIndex
CREATE INDEX "CommunityPostComment_status_idx" ON "CommunityPostComment"("status");

-- AddForeignKey
ALTER TABLE "CommunityPostCommentLike" ADD CONSTRAINT "CommunityPostCommentLike_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "CommunityPostComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPostCommentLike" ADD CONSTRAINT "CommunityPostCommentLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
