-- CreateTable
CREATE TABLE "FxProvider" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "baseUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "settingsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FxProvider_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "FxSnapshot" (
    "id" TEXT NOT NULL,
    "providerCode" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sourceTimestamp" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "isFrozen" BOOLEAN NOT NULL DEFAULT false,
    "sourceMeta" JSONB,

    CONSTRAINT "FxSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FxRate" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "quoteCurrency" TEXT NOT NULL,
    "rate" DECIMAL(20,10) NOT NULL,
    "effectiveRate" DECIMAL(20,10),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FxManualOverride" (
    "id" TEXT NOT NULL,
    "fromCurrency" TEXT NOT NULL,
    "toCurrency" TEXT NOT NULL,
    "rate" DECIMAL(20,10) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FxManualOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FxSyncJob" (
    "id" TEXT NOT NULL,
    "providerCode" TEXT NOT NULL,
    "snapshotId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "baseCurrency" TEXT NOT NULL,
    "requestedById" TEXT,
    "triggerType" TEXT NOT NULL DEFAULT 'manual',
    "error" TEXT,
    "recordsInserted" INTEGER NOT NULL DEFAULT 0,
    "meta" JSONB,

    CONSTRAINT "FxSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FxProvider_enabled_priority_idx" ON "FxProvider"("enabled", "priority");

-- CreateIndex
CREATE INDEX "FxSnapshot_providerCode_baseCurrency_fetchedAt_idx" ON "FxSnapshot"("providerCode", "baseCurrency", "fetchedAt");

-- CreateIndex
CREATE INDEX "FxSnapshot_status_baseCurrency_approvedAt_idx" ON "FxSnapshot"("status", "baseCurrency", "approvedAt");

-- CreateIndex
CREATE INDEX "FxSnapshot_isFrozen_baseCurrency_fetchedAt_idx" ON "FxSnapshot"("isFrozen", "baseCurrency", "fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FxRate_snapshotId_quoteCurrency_key" ON "FxRate"("snapshotId", "quoteCurrency");

-- CreateIndex
CREATE INDEX "FxRate_quoteCurrency_idx" ON "FxRate"("quoteCurrency");

-- CreateIndex
CREATE INDEX "FxManualOverride_fromCurrency_toCurrency_status_effectiveFrom_idx" ON "FxManualOverride"("fromCurrency", "toCurrency", "status", "effectiveFrom");

-- CreateIndex
CREATE INDEX "FxManualOverride_status_createdAt_idx" ON "FxManualOverride"("status", "createdAt");

-- CreateIndex
CREATE INDEX "FxSyncJob_providerCode_startedAt_idx" ON "FxSyncJob"("providerCode", "startedAt");

-- CreateIndex
CREATE INDEX "FxSyncJob_status_startedAt_idx" ON "FxSyncJob"("status", "startedAt");

-- AddForeignKey
ALTER TABLE "FxSnapshot" ADD CONSTRAINT "FxSnapshot_providerCode_fkey" FOREIGN KEY ("providerCode") REFERENCES "FxProvider"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FxRate" ADD CONSTRAINT "FxRate_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "FxSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FxSyncJob" ADD CONSTRAINT "FxSyncJob_providerCode_fkey" FOREIGN KEY ("providerCode") REFERENCES "FxProvider"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FxSyncJob" ADD CONSTRAINT "FxSyncJob_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "FxSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
