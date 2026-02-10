-- CreateEnum
CREATE TYPE "PreloaderStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PreloaderLoaderType" AS ENUM ('SPINNER', 'PROGRESS', 'LOGO_PULSE', 'DOTS', 'SKELETON', 'LOTTIE');

-- CreateEnum
CREATE TYPE "PreloaderBackgroundType" AS ENUM ('SOLID', 'GRADIENT');

-- CreateEnum
CREATE TYPE "PreloaderPosition" AS ENUM ('CENTER', 'BOTTOM');

-- CreateTable
CREATE TABLE "PreloaderConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "PreloaderStatus" NOT NULL DEFAULT 'DRAFT',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "minDurationMs" INTEGER NOT NULL DEFAULT 800,
    "maxDurationMs" INTEGER NOT NULL DEFAULT 5000,
    "showOnInitialLoad" BOOLEAN NOT NULL DEFAULT true,
    "showOnRouteChange" BOOLEAN NOT NULL DEFAULT true,
    "showOnApiLoading" BOOLEAN NOT NULL DEFAULT false,
    "headlineText" TEXT,
    "subText" TEXT,
    "loaderType" "PreloaderLoaderType" NOT NULL DEFAULT 'SPINNER',
    "logoFileId" TEXT,
    "backgroundType" "PreloaderBackgroundType" NOT NULL DEFAULT 'SOLID',
    "backgroundColor" TEXT NOT NULL DEFAULT '#0f172a',
    "gradientFrom" TEXT,
    "gradientTo" TEXT,
    "overlayOpacity" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "blurPx" INTEGER NOT NULL DEFAULT 0,
    "accentColor" TEXT NOT NULL DEFAULT '#3b82f6',
    "textColor" TEXT NOT NULL DEFAULT '#ffffff',
    "animationSpeed" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "position" "PreloaderPosition" NOT NULL DEFAULT 'CENTER',
    "customCss" TEXT,
    "updatedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreloaderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PreloaderConfig_isActive_idx" ON "PreloaderConfig"("isActive");

-- CreateIndex
CREATE INDEX "PreloaderConfig_status_idx" ON "PreloaderConfig"("status");

-- CreateIndex
CREATE INDEX "PreloaderConfig_updatedByAdminId_idx" ON "PreloaderConfig"("updatedByAdminId");

-- AddForeignKey
ALTER TABLE "PreloaderConfig" ADD CONSTRAINT "PreloaderConfig_updatedByAdminId_fkey" FOREIGN KEY ("updatedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

