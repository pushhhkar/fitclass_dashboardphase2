-- ============================================================================
--  FitClass CRM — Phase 2M — sheet (branch) ownership table
--  Migration: 20260523000000_create_sheet_assignments
-- ============================================================================
--
--  Phase 2M splits assignments into TWO distinct concepts:
--
--    1. SHEET ASSIGNMENTS (this table)
--       Who OWNS a branch / sheet. Performed by:
--         admin   → assigns sheets to manager
--         manager → assigns sheets to senior_sales_executive
--       A sheet can have multiple owners; one row per (branch, user) pair.
--
--    2. LEAD ASSIGNMENTS (existing `assignments` table — conceptually
--       lead_assignments). Performed by:
--         senior_sales_executive → assigns individual leads to sales_executive
--
--  Why a SEPARATE table for sheet ownership:
--   - Cardinality differs. Lead assignment is per-row; sheet ownership is
--     per-branch. Overloading one table would force every lead-assignment
--     consumer to filter by a discriminator column. Two tables = two clear
--     reads.
--   - Lifecycle differs. Sheet ownership is org-structural (changes when a
--     manager joins / leaves). Lead ownership is operational (changes daily
--     during pipeline work). Mixing audit grain hides org churn under
--     operational noise.
--   - Permission gates differ. canAssignSheetToUser vs canAssignToUser —
--     two predicates, two truth tables.
--
--  Sync with users.allowed_branches:
--   The legacy `users.allowed_branches` column remains the *runtime* check
--   read by canAccessLeadBranch / canAssignLeadToBranch. The mutation
--   layer dual-writes: inserting a sheet_assignments row also appends to
--   the owner's allowed_branches; deleting removes it. This keeps every
--   existing branch-enforcement code path working while introducing the
--   formal ownership record.
-- ============================================================================

create table if not exists public.sheet_assignments (
  id          uuid        primary key default gen_random_uuid(),
  branch      text        not null,
  user_id     uuid        not null references public.users (id) on delete cascade,
  assigned_by uuid        references public.users (id) on delete set null,
  assigned_at timestamptz not null default now(),
  notes       text
);

-- One ownership row per (branch, user) pair — prevents duplicates from
-- accidental double-assignments.
create unique index if not exists sheet_assignments_branch_user_uidx
  on public.sheet_assignments (branch, user_id);

create index if not exists sheet_assignments_user_id_idx
  on public.sheet_assignments (user_id);
create index if not exists sheet_assignments_branch_idx
  on public.sheet_assignments (branch);

-- Same RLS posture as every other table — deny-by-default for anon /
-- authenticated, server-side service-role bypass for the API handlers.
alter table public.sheet_assignments enable row level security;
