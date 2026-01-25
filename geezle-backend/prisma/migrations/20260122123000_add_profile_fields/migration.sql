-- Add missing User.profilePhotoFileId column
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "profilePhotoFileId" TEXT;

-- Add missing Profile columns used by the app
ALTER TABLE "Profile"
ADD COLUMN IF NOT EXISTS "title" TEXT,
ADD COLUMN IF NOT EXISTS "location" TEXT,
ADD COLUMN IF NOT EXISTS "introVideoUrl" TEXT,
ADD COLUMN IF NOT EXISTS "portfolio" JSONB,
ADD COLUMN IF NOT EXISTS "experienceItems" JSONB,
ADD COLUMN IF NOT EXISTS "educationItems" JSONB,
ADD COLUMN IF NOT EXISTS "certifications" JSONB;
