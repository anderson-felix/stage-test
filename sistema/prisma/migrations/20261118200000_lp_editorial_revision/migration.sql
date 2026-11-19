-- Existing publications/drafts start at revision 0; metrics do not advance it.
ALTER TABLE "LandingPage" ADD COLUMN "editorialRevision" INTEGER NOT NULL DEFAULT 0;
