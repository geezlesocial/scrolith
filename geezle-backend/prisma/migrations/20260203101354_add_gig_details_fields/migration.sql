-- AlterTable
ALTER TABLE "Gig" ADD COLUMN     "documents" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "extras" JSONB,
ADD COLUMN     "faqs" JSONB,
ADD COLUMN     "image" TEXT,
ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "meta" JSONB,
ADD COLUMN     "packages" JSONB,
ADD COLUMN     "pricingMode" TEXT NOT NULL DEFAULT 'packages',
ADD COLUMN     "requirements" JSONB,
ADD COLUMN     "subcategory" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "videos" TEXT[] DEFAULT ARRAY[]::TEXT[];
