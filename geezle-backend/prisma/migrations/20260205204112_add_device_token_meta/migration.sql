-- AlterTable
ALTER TABLE "DeviceToken" ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "DeviceToken_deviceId_idx" ON "DeviceToken"("deviceId");
