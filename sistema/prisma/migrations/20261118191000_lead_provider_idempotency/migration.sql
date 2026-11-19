ALTER TABLE "LpLead" ADD COLUMN "emailPayload" JSONB, ADD COLUMN "emailFirstAttemptAt" TIMESTAMP(3), ADD COLUMN "emailProviderId" TEXT;
