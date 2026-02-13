-- CreateTable
CREATE TABLE "TranslationKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "namespace" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranslationKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranslationValue" (
    "id" TEXT NOT NULL,
    "translationKeyId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranslationValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TextOverride" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "matchText" TEXT NOT NULL,
    "replacementText" TEXT NOT NULL,
    "isRegex" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "updatedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TextOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LanguageConfig" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'default',
    "defaultLocale" TEXT NOT NULL DEFAULT 'en',
    "enabledLocales" TEXT[] DEFAULT ARRAY['en']::TEXT[],
    "rtlLocales" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dictionaryCacheSeconds" INTEGER NOT NULL DEFAULT 300,
    "overridesCacheSeconds" INTEGER NOT NULL DEFAULT 300,
    "updatedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LanguageConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TranslationKey_key_key" ON "TranslationKey"("key");

-- CreateIndex
CREATE INDEX "TranslationKey_namespace_idx" ON "TranslationKey"("namespace");

-- CreateIndex
CREATE INDEX "TranslationKey_isActive_idx" ON "TranslationKey"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TranslationValue_translationKeyId_locale_key" ON "TranslationValue"("translationKeyId", "locale");

-- CreateIndex
CREATE INDEX "TranslationValue_locale_idx" ON "TranslationValue"("locale");

-- CreateIndex
CREATE INDEX "TranslationValue_updatedByAdminId_idx" ON "TranslationValue"("updatedByAdminId");

-- CreateIndex
CREATE INDEX "TranslationValue_updatedAt_idx" ON "TranslationValue"("updatedAt");

-- CreateIndex
CREATE INDEX "TextOverride_locale_enabled_priority_idx" ON "TextOverride"("locale", "enabled", "priority");

-- CreateIndex
CREATE INDEX "TextOverride_updatedByAdminId_idx" ON "TextOverride"("updatedByAdminId");

-- CreateIndex
CREATE INDEX "TextOverride_updatedAt_idx" ON "TextOverride"("updatedAt");

-- CreateIndex
CREATE INDEX "LanguageConfig_updatedByAdminId_idx" ON "LanguageConfig"("updatedByAdminId");

-- CreateIndex
CREATE INDEX "LanguageConfig_updatedAt_idx" ON "LanguageConfig"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LanguageConfig_scope_key" ON "LanguageConfig"("scope");

-- AddForeignKey
ALTER TABLE "TranslationValue" ADD CONSTRAINT "TranslationValue_translationKeyId_fkey" FOREIGN KEY ("translationKeyId") REFERENCES "TranslationKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationValue" ADD CONSTRAINT "TranslationValue_updatedByAdminId_fkey" FOREIGN KEY ("updatedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TextOverride" ADD CONSTRAINT "TextOverride_updatedByAdminId_fkey" FOREIGN KEY ("updatedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LanguageConfig" ADD CONSTRAINT "LanguageConfig_updatedByAdminId_fkey" FOREIGN KEY ("updatedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
