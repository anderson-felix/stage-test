-- Targeted recovery for the observed legacy-outbox overlap. NOT a migration.
-- Run with the project's Prisma 6 CLI, then verify before migrate resolve.
-- This recovery intentionally refuses populated tables: legacy notification
-- state/payload mapping needs its own review when records exist.
BEGIN;
SET LOCAL lock_timeout = '10s';
LOCK TABLE "LpLead" IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  expected record;
  actual record;
BEGIN
  IF EXISTS (SELECT 1 FROM "LpLead" LIMIT 1) THEN
    RAISE EXCEPTION 'Recovery requires an empty LpLead table; inspect legacy notification records before proceeding';
  END IF;
  FOR expected IN
    SELECT * FROM (VALUES
      ('emailLeaseOwner', 'text', 'YES'),
      ('emailLeaseUntil', 'timestamp', 'YES'),
      ('emailAttemptCount', 'int4', 'NO'),
      ('emailNextAttemptAt', 'timestamp', 'YES'),
      ('emailLastError', 'text', 'YES'),
      ('emailPayload', 'jsonb', 'YES'),
      ('emailFirstAttemptAt', 'timestamp', 'YES'),
      ('emailProviderId', 'text', 'YES')
    ) AS fields(name, type_name, nullable)
  LOOP
    SELECT udt_name, is_nullable INTO actual FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'LpLead'
        AND column_name = expected.name;
    IF FOUND AND (actual.udt_name <> expected.type_name OR actual.is_nullable <> expected.nullable) THEN
      RAISE EXCEPTION 'Incompatible existing column %: inspect type/nullability before recovery', expected.name;
    END IF;
  END LOOP;
END $$;

ALTER TABLE "LpLead"
  ADD COLUMN IF NOT EXISTS "emailLeaseOwner" TEXT,
  ADD COLUMN IF NOT EXISTS "emailLeaseUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "emailAttemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "emailNextAttemptAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "emailLastError" TEXT,
  ADD COLUMN IF NOT EXISTS "emailPayload" JSONB,
  ADD COLUMN IF NOT EXISTS "emailFirstAttemptAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "emailProviderId" TEXT;

-- Completes the historical data step; the guard above ensures no lead changes.
UPDATE "LpLead" SET "emailDeliveryStatus" = 'failed_final',
  "emailLastError" = 'LEGACY_DELIVERY_REVIEW_REQUIRED'
WHERE "emailDeliveryStatus" IN ('sending', 'failed');

CREATE INDEX IF NOT EXISTS "lead_email_delivery_due_idx"
  ON "LpLead"("emailDeliveryStatus", "emailNextAttemptAt", "emailLeaseUntil");
COMMIT;
