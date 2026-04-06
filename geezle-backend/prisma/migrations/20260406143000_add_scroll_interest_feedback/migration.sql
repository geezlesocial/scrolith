-- CreateEnum
CREATE TYPE "ScrollFeedbackSignal" AS ENUM ('INTERESTED', 'NOT_INTERESTED');

-- CreateTable
CREATE TABLE "ScrollHidden" (
    "id" TEXT NOT NULL,
    "scrollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrollHidden_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrollFeedback" (
    "id" TEXT NOT NULL,
    "scrollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "signal" "ScrollFeedbackSignal" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScrollFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScrollHidden_scrollId_userId_key" ON "ScrollHidden"("scrollId", "userId");

-- CreateIndex
CREATE INDEX "ScrollHidden_userId_idx" ON "ScrollHidden"("userId");

-- CreateIndex
CREATE INDEX "ScrollHidden_scrollId_idx" ON "ScrollHidden"("scrollId");

-- CreateIndex
CREATE INDEX "ScrollHidden_createdAt_idx" ON "ScrollHidden"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScrollFeedback_scrollId_userId_key" ON "ScrollFeedback"("scrollId", "userId");

-- CreateIndex
CREATE INDEX "ScrollFeedback_userId_idx" ON "ScrollFeedback"("userId");

-- CreateIndex
CREATE INDEX "ScrollFeedback_scrollId_idx" ON "ScrollFeedback"("scrollId");

-- CreateIndex
CREATE INDEX "ScrollFeedback_signal_idx" ON "ScrollFeedback"("signal");

-- CreateIndex
CREATE INDEX "ScrollFeedback_updatedAt_idx" ON "ScrollFeedback"("updatedAt");

-- AddForeignKey
ALTER TABLE "ScrollHidden" ADD CONSTRAINT "ScrollHidden_scrollId_fkey" FOREIGN KEY ("scrollId") REFERENCES "ScrollVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrollHidden" ADD CONSTRAINT "ScrollHidden_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrollFeedback" ADD CONSTRAINT "ScrollFeedback_scrollId_fkey" FOREIGN KEY ("scrollId") REFERENCES "ScrollVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrollFeedback" ADD CONSTRAINT "ScrollFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
