-- AlterTable: additive scheduling, backoff, diagnostics, and concurrency lease fields for CustomDomain
ALTER TABLE "CustomDomain"
  ADD COLUMN IF NOT EXISTS "nextCheckAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "checkAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastReasonCode" TEXT,
  ADD COLUMN IF NOT EXISTS "lastError" TEXT,
  ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lockedBy" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomDomain_dnsStatus_nextCheckAt_lastCheckedAt_idx"
  ON "CustomDomain"("dnsStatus", "nextCheckAt", "lastCheckedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomDomain_sslStatus_nextCheckAt_idx"
  ON "CustomDomain"("sslStatus", "nextCheckAt");

