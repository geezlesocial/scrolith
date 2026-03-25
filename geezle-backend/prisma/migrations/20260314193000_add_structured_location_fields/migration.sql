ALTER TABLE "Profile"
ADD COLUMN "formattedAddress" TEXT,
ADD COLUMN "country" TEXT,
ADD COLUMN "countryCode" TEXT,
ADD COLUMN "state" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "region" TEXT,
ADD COLUMN "postalCode" TEXT,
ADD COLUMN "latitude" DOUBLE PRECISION,
ADD COLUMN "longitude" DOUBLE PRECISION,
ADD COLUMN "placeId" TEXT,
ADD COLUMN "locationSource" TEXT;

ALTER TABLE "CommunityBusinessPage"
ADD COLUMN "formattedAddress" TEXT,
ADD COLUMN "country" TEXT,
ADD COLUMN "countryCode" TEXT,
ADD COLUMN "state" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "region" TEXT,
ADD COLUMN "postalCode" TEXT,
ADD COLUMN "latitude" DOUBLE PRECISION,
ADD COLUMN "longitude" DOUBLE PRECISION,
ADD COLUMN "placeId" TEXT,
ADD COLUMN "locationSource" TEXT;
