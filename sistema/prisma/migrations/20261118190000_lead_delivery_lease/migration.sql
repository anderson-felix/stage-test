ALTER TABLE "LpLead"
  ADD COLUMN "emailLeaseOwner" TEXT,
  ADD COLUMN "emailLeaseUntil" TIMESTAMP(3),
  ADD COLUMN "emailAttemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "emailNextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "emailLastError" TEXT;
-- Historical attempts have no reliable acceptance record: operator reconciliation.
UPDATE "LpLead" SET "emailDeliveryStatus" = 'failed_final',
  "emailLastError" = 'LEGACY_DELIVERY_REVIEW_REQUIRED'
WHERE "emailDeliveryStatus" IN ('sending', 'failed');
CREATE INDEX "lead_email_delivery_due_idx"
ON "LpLead"("emailDeliveryStatus", "emailNextAttemptAt", "emailLeaseUntil");
