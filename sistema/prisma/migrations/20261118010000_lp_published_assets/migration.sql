-- AlterTable: additive publishedAssetIds array on LandingPage for public media authorization
ALTER TABLE "LandingPage"
  ADD COLUMN IF NOT EXISTS "publishedAssetIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

