-- ============================================================================
--  FitClass CRM — Phase 2H — backfill legacy 'sales' rows
--  Migration: 20260522000001_backfill_sales_to_sales_executive
-- ============================================================================
--
--  Map every existing user whose role is still the legacy 'sales' to the new
--  default sales-tier role 'sales_executive'. Admins may later promote
--  specific users to 'senior_sales_executive' from the UI.
--
--  Runs in its own transaction (separate file) so the enum values added in
--  the preceding migration are guaranteed-committed before this UPDATE
--  references them.
-- ============================================================================

update public.users
set role = 'sales_executive'
where role = 'sales';
