-- Run by the production build right after `prisma db push` (see vercel.json).
--
-- `db push` creates tables with Row Level Security OFF, and the Supabase anon
-- key is NEXT_PUBLIC_ — it ships in the client bundle — so a table without RLS
-- is world-readable and world-deletable through PostgREST. Every table below is
-- read only by Prisma, which connects as the owner and bypasses RLS, so
-- "enabled with no policies" denies the anon key everything and breaks nothing.
--
-- ENABLE is idempotent, and Prisma does not model RLS, so `db push` never
-- reverts it. List a new table here in the same PR that adds it to the schema.
--
-- NOT for SystemMeta: Realtime needs anon SELECT on it (see CLAUDE.md).

ALTER TABLE "ErrorEvent"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProblemReport"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnnouncementSeen" ENABLE ROW LEVEL SECURITY;
