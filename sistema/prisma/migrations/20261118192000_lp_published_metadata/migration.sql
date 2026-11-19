-- No backfill from editable drafts: legacy publications keep only their Blob tags.
ALTER TABLE "LandingPage" ADD COLUMN "publishedMetadata" JSONB;
