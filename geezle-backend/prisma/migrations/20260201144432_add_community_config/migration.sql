-- CreateTable
CREATE TABLE "community_config" (
    "id" TEXT NOT NULL,
    "communityEnabled" BOOLEAN NOT NULL DEFAULT true,
    "storiesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "adsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "gcoinEnabled" BOOLEAN NOT NULL DEFAULT false,
    "maxImagesPerPost" INTEGER NOT NULL DEFAULT 5,
    "maxVideoSizeMb" INTEGER NOT NULL DEFAULT 50,
    "storyExpiryHours" INTEGER NOT NULL DEFAULT 24,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_config_pkey" PRIMARY KEY ("id")
);
