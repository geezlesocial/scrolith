-- Scrolith Founding Partners: contractual profit participation domain.
-- Additive migration. No existing tables or columns are modified.

CREATE TABLE "FoundingPartnerProgram" (
    "id" TEXT NOT NULL,
    "programKey" TEXT NOT NULL DEFAULT 'founding-partners',
    "displayName" TEXT NOT NULL DEFAULT 'Scrolith Founding Partners',
    "status" TEXT NOT NULL DEFAULT 'PAUSED',
    "capacity" INTEGER NOT NULL DEFAULT 1000000,
    "enrolledCount" INTEGER NOT NULL DEFAULT 0,
    "profitSharePercent" DECIMAL(5,2) NOT NULL DEFAULT 20,
    "termYears" INTEGER NOT NULL DEFAULT 100,
    "enrollmentFee" DECIMAL(12,2) NOT NULL DEFAULT 2,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "startedAt" TIMESTAMP(3),
    "termExtendedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FoundingPartnerProgram_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FoundingPartner" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "fullName" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "stateRegion" TEXT,
    "encryptedTaxId" TEXT,
    "taxIdLast4" TEXT,
    "termsVersion" TEXT NOT NULL,
    "termsAcceptedAt" TIMESTAMP(3) NOT NULL,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivatedAt" TIMESTAMP(3),
    "deactivatedReason" TEXT,
    "reactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FoundingPartner_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FoundingPartnerEnrollmentPayment" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partnerId" TEXT,
    "provider" TEXT NOT NULL,
    "providerReferenceId" TEXT,
    "providerIntentId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "providerPayload" JSONB,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FoundingPartnerEnrollmentPayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FoundingPartnerProfitPeriod" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "clearedProfit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "partnerPool" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "activePartnerCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "closedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "distributedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FoundingPartnerProfitPeriod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FoundingPartnerProfitSource" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "clearedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "adjustments" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "evidence" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FoundingPartnerProfitSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FoundingPartnerDistributionRun" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "idempotencyKey" TEXT NOT NULL,
    "poolAmount" DECIMAL(18,2) NOT NULL,
    "partnerCount" INTEGER NOT NULL,
    "perPartnerAmount" DECIMAL(18,2) NOT NULL,
    "approvedById" TEXT,
    "executedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FoundingPartnerDistributionRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FoundingPartnerDistribution" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "walletAmount" DECIMAL(18,2),
    "walletCurrency" TEXT,
    "fxRate" DECIMAL(18,8),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "walletTransactionId" TEXT,
    "creditedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FoundingPartnerDistribution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FoundingPartnerAuditLog" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FoundingPartnerAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FoundingPartnerProgram_programKey_key" ON "FoundingPartnerProgram"("programKey");
CREATE UNIQUE INDEX "FoundingPartner_userId_key" ON "FoundingPartner"("userId");
CREATE UNIQUE INDEX "FoundingPartnerEnrollmentPayment_partnerId_key" ON "FoundingPartnerEnrollmentPayment"("partnerId");
CREATE UNIQUE INDEX "FoundingPartnerEnrollmentPayment_idempotencyKey_key" ON "FoundingPartnerEnrollmentPayment"("idempotencyKey");
CREATE UNIQUE INDEX "FoundingPartnerEnrollmentPayment_provider_providerReferenceId_key" ON "FoundingPartnerEnrollmentPayment"("provider", "providerReferenceId");
CREATE UNIQUE INDEX "FoundingPartnerProfitPeriod_programId_periodYear_key" ON "FoundingPartnerProfitPeriod"("programId", "periodYear");
CREATE UNIQUE INDEX "FoundingPartnerProfitSource_periodId_sourceType_key" ON "FoundingPartnerProfitSource"("periodId", "sourceType");
CREATE UNIQUE INDEX "FoundingPartnerDistributionRun_periodId_key" ON "FoundingPartnerDistributionRun"("periodId");
CREATE UNIQUE INDEX "FoundingPartnerDistributionRun_idempotencyKey_key" ON "FoundingPartnerDistributionRun"("idempotencyKey");
CREATE UNIQUE INDEX "FoundingPartnerDistribution_runId_partnerId_key" ON "FoundingPartnerDistribution"("runId", "partnerId");
CREATE UNIQUE INDEX "FoundingPartnerDistribution_idempotencyKey_key" ON "FoundingPartnerDistribution"("idempotencyKey");
CREATE UNIQUE INDEX "FoundingPartnerDistribution_walletTransactionId_key" ON "FoundingPartnerDistribution"("walletTransactionId");

CREATE INDEX "FoundingPartner_programId_status_idx" ON "FoundingPartner"("programId", "status");
CREATE INDEX "FoundingPartner_status_enrolledAt_idx" ON "FoundingPartner"("status", "enrolledAt");
CREATE INDEX "FoundingPartnerEnrollmentPayment_userId_status_idx" ON "FoundingPartnerEnrollmentPayment"("userId", "status");
CREATE INDEX "FoundingPartnerEnrollmentPayment_programId_status_idx" ON "FoundingPartnerEnrollmentPayment"("programId", "status");
CREATE INDEX "FoundingPartnerProfitPeriod_status_periodYear_idx" ON "FoundingPartnerProfitPeriod"("status", "periodYear");
CREATE INDEX "FoundingPartnerProfitSource_periodId_idx" ON "FoundingPartnerProfitSource"("periodId");
CREATE INDEX "FoundingPartnerDistributionRun_status_createdAt_idx" ON "FoundingPartnerDistributionRun"("status", "createdAt");
CREATE INDEX "FoundingPartnerDistribution_userId_status_createdAt_idx" ON "FoundingPartnerDistribution"("userId", "status", "createdAt");
CREATE INDEX "FoundingPartnerAuditLog_programId_createdAt_idx" ON "FoundingPartnerAuditLog"("programId", "createdAt");
CREATE INDEX "FoundingPartnerAuditLog_actorUserId_createdAt_idx" ON "FoundingPartnerAuditLog"("actorUserId", "createdAt");
CREATE INDEX "FoundingPartnerAuditLog_entityType_entityId_idx" ON "FoundingPartnerAuditLog"("entityType", "entityId");

ALTER TABLE "FoundingPartner" ADD CONSTRAINT "FoundingPartner_programId_fkey" FOREIGN KEY ("programId") REFERENCES "FoundingPartnerProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoundingPartner" ADD CONSTRAINT "FoundingPartner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FoundingPartnerEnrollmentPayment" ADD CONSTRAINT "FoundingPartnerEnrollmentPayment_programId_fkey" FOREIGN KEY ("programId") REFERENCES "FoundingPartnerProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoundingPartnerEnrollmentPayment" ADD CONSTRAINT "FoundingPartnerEnrollmentPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FoundingPartnerEnrollmentPayment" ADD CONSTRAINT "FoundingPartnerEnrollmentPayment_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "FoundingPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FoundingPartnerProfitPeriod" ADD CONSTRAINT "FoundingPartnerProfitPeriod_programId_fkey" FOREIGN KEY ("programId") REFERENCES "FoundingPartnerProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoundingPartnerProfitPeriod" ADD CONSTRAINT "FoundingPartnerProfitPeriod_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FoundingPartnerProfitSource" ADD CONSTRAINT "FoundingPartnerProfitSource_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FoundingPartnerProfitPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FoundingPartnerDistributionRun" ADD CONSTRAINT "FoundingPartnerDistributionRun_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FoundingPartnerProfitPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoundingPartnerDistributionRun" ADD CONSTRAINT "FoundingPartnerDistributionRun_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FoundingPartnerDistributionRun" ADD CONSTRAINT "FoundingPartnerDistributionRun_executedById_fkey" FOREIGN KEY ("executedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FoundingPartnerDistribution" ADD CONSTRAINT "FoundingPartnerDistribution_runId_fkey" FOREIGN KEY ("runId") REFERENCES "FoundingPartnerDistributionRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoundingPartnerDistribution" ADD CONSTRAINT "FoundingPartnerDistribution_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "FoundingPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoundingPartnerAuditLog" ADD CONSTRAINT "FoundingPartnerAuditLog_programId_fkey" FOREIGN KEY ("programId") REFERENCES "FoundingPartnerProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FoundingPartnerAuditLog" ADD CONSTRAINT "FoundingPartnerAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
