-- ============================================================================
--  FitClass CRM — Phase 2F — assignments table extensions
--  Migration: 20260521000000_assignments_branch_and_uniqueness
-- ============================================================================
--
--  Phase 2F treats each row in `assignments` as the CURRENT owner of a lead
--  (one row per lead at any time). Reassignment history lives in the
--  `activities` audit log — keeping that single-row invariant clean is what
--  unlocks fast joins / permission checks against the leads payload.
--
--  Changes:
--   1. NEW column `branch` (text, not null). Denormalised from the lead's
--      Google-Sheets tab name so server-side permission checks
--      (canAccessLeadBranch / canTransferLead) don't need to round-trip to
--      Sheets just to authorise an assignment mutation.
--
--   2. UNIQUE index on `lead_id`. Enforces "one assignment per lead" at the
--      DB level — accidental dupes become 23505 unique-violation errors that
--      the API layer surfaces as a clean 409.
--
--   3. Helper index on `branch` for branch-scoped admin lookups
--      (e.g. "all leads currently assigned in HSR Layout").
-- ============================================================================

alter table public.assignments
  add column if not exists branch text;

-- Backfill any pre-existing rows (none expected, but safe).
update public.assignments set branch = '' where branch is null;

alter table public.assignments
  alter column branch set not null;

create unique index if not exists assignments_lead_id_uidx
  on public.assignments (lead_id);

create index if not exists assignments_branch_idx
  on public.assignments (branch);
