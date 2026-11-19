-- AlterTable: additive explicit home Landing Page association for CustomDomain
ALTER TABLE "CustomDomain"
  ADD COLUMN IF NOT EXISTS "homeLandingPageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CustomDomain_homeLandingPageId_key"
  ON "CustomDomain"("homeLandingPageId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CustomDomain_homeLandingPageId_fkey'
  ) THEN
    ALTER TABLE "CustomDomain"
      ADD CONSTRAINT "CustomDomain_homeLandingPageId_fkey"
      FOREIGN KEY ("homeLandingPageId") REFERENCES "LandingPage"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

