ALTER TYPE "CategoryType" ADD VALUE 'MARKETPLACE';

ALTER TYPE "FavoriteEntityType" ADD VALUE 'MARKETPLACE';

CREATE TABLE "MarketplaceListing" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categoryId" TEXT,
    "subcategoryId" TEXT,
    "condition" TEXT NOT NULL DEFAULT 'new',
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "negotiable" BOOLEAN NOT NULL DEFAULT false,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "location" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "deliveryOptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "paymentMethods" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'draft',
    "reviewStatus" TEXT NOT NULL DEFAULT 'pending',
    "rejectionReason" TEXT,
    "adminNotes" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "promoted" BOOLEAN NOT NULL DEFAULT false,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "saveCount" INTEGER NOT NULL DEFAULT 0,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "soldAt" TIMESTAMP(3),
    "reservedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceListing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketplaceListingMedia" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "fileId" TEXT,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationSeconds" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceListingMedia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketplaceInquiry" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "conversationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceInquiry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketplaceReport" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolution" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketplaceOrder" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paymentMethod" TEXT,
    "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "deliveryOption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketplaceAuditLog" (
    "id" TEXT NOT NULL,
    "listingId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketplaceListing_slug_key" ON "MarketplaceListing"("slug");
CREATE UNIQUE INDEX "MarketplaceOrder_orderNumber_key" ON "MarketplaceOrder"("orderNumber");

CREATE INDEX "MarketplaceListing_sellerId_idx" ON "MarketplaceListing"("sellerId");
CREATE INDEX "MarketplaceListing_categoryId_idx" ON "MarketplaceListing"("categoryId");
CREATE INDEX "MarketplaceListing_status_idx" ON "MarketplaceListing"("status");
CREATE INDEX "MarketplaceListing_reviewStatus_idx" ON "MarketplaceListing"("reviewStatus");
CREATE INDEX "MarketplaceListing_featured_idx" ON "MarketplaceListing"("featured");
CREATE INDEX "MarketplaceListing_createdAt_idx" ON "MarketplaceListing"("createdAt");
CREATE INDEX "MarketplaceListing_price_idx" ON "MarketplaceListing"("price");
CREATE INDEX "MarketplaceListing_removedAt_idx" ON "MarketplaceListing"("removedAt");

CREATE INDEX "MarketplaceListingMedia_listingId_idx" ON "MarketplaceListingMedia"("listingId");
CREATE INDEX "MarketplaceListingMedia_fileId_idx" ON "MarketplaceListingMedia"("fileId");
CREATE INDEX "MarketplaceListingMedia_type_idx" ON "MarketplaceListingMedia"("type");
CREATE INDEX "MarketplaceListingMedia_sortOrder_idx" ON "MarketplaceListingMedia"("sortOrder");
CREATE INDEX "MarketplaceListingMedia_createdAt_idx" ON "MarketplaceListingMedia"("createdAt");

CREATE INDEX "MarketplaceInquiry_listingId_idx" ON "MarketplaceInquiry"("listingId");
CREATE INDEX "MarketplaceInquiry_buyerId_idx" ON "MarketplaceInquiry"("buyerId");
CREATE INDEX "MarketplaceInquiry_sellerId_idx" ON "MarketplaceInquiry"("sellerId");
CREATE INDEX "MarketplaceInquiry_status_idx" ON "MarketplaceInquiry"("status");
CREATE INDEX "MarketplaceInquiry_createdAt_idx" ON "MarketplaceInquiry"("createdAt");

CREATE INDEX "MarketplaceReport_listingId_idx" ON "MarketplaceReport"("listingId");
CREATE INDEX "MarketplaceReport_reporterId_idx" ON "MarketplaceReport"("reporterId");
CREATE INDEX "MarketplaceReport_resolvedById_idx" ON "MarketplaceReport"("resolvedById");
CREATE INDEX "MarketplaceReport_status_idx" ON "MarketplaceReport"("status");
CREATE INDEX "MarketplaceReport_createdAt_idx" ON "MarketplaceReport"("createdAt");

CREATE INDEX "MarketplaceOrder_listingId_idx" ON "MarketplaceOrder"("listingId");
CREATE INDEX "MarketplaceOrder_buyerId_idx" ON "MarketplaceOrder"("buyerId");
CREATE INDEX "MarketplaceOrder_sellerId_idx" ON "MarketplaceOrder"("sellerId");
CREATE INDEX "MarketplaceOrder_status_idx" ON "MarketplaceOrder"("status");
CREATE INDEX "MarketplaceOrder_paymentStatus_idx" ON "MarketplaceOrder"("paymentStatus");
CREATE INDEX "MarketplaceOrder_createdAt_idx" ON "MarketplaceOrder"("createdAt");

CREATE INDEX "MarketplaceAuditLog_listingId_idx" ON "MarketplaceAuditLog"("listingId");
CREATE INDEX "MarketplaceAuditLog_actorId_idx" ON "MarketplaceAuditLog"("actorId");
CREATE INDEX "MarketplaceAuditLog_action_idx" ON "MarketplaceAuditLog"("action");
CREATE INDEX "MarketplaceAuditLog_createdAt_idx" ON "MarketplaceAuditLog"("createdAt");

ALTER TABLE "MarketplaceListing"
    ADD CONSTRAINT "MarketplaceListing_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplaceListing"
    ADD CONSTRAINT "MarketplaceListing_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MarketplaceListingMedia"
    ADD CONSTRAINT "MarketplaceListingMedia_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplaceListingMedia"
    ADD CONSTRAINT "MarketplaceListingMedia_fileId_fkey"
    FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MarketplaceInquiry"
    ADD CONSTRAINT "MarketplaceInquiry_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplaceInquiry"
    ADD CONSTRAINT "MarketplaceInquiry_buyerId_fkey"
    FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplaceInquiry"
    ADD CONSTRAINT "MarketplaceInquiry_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplaceReport"
    ADD CONSTRAINT "MarketplaceReport_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplaceReport"
    ADD CONSTRAINT "MarketplaceReport_reporterId_fkey"
    FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplaceReport"
    ADD CONSTRAINT "MarketplaceReport_resolvedById_fkey"
    FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MarketplaceOrder"
    ADD CONSTRAINT "MarketplaceOrder_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplaceOrder"
    ADD CONSTRAINT "MarketplaceOrder_buyerId_fkey"
    FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplaceOrder"
    ADD CONSTRAINT "MarketplaceOrder_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplaceAuditLog"
    ADD CONSTRAINT "MarketplaceAuditLog_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplaceAuditLog"
    ADD CONSTRAINT "MarketplaceAuditLog_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
