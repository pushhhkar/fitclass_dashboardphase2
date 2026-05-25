-- ============================================================================
--  FitClass CRM — Phase 2Q — finalize user_role enum
--  Migration: 20260524000000_finalize_user_role_enum
-- ============================================================================
--
--  Production error being fixed:
--     POST /api/users → "invalid input value for enum user_role:
--                       'senior_sales_executive'"
--
--  The application code (Phase 2H onward) treats the role universe as:
--      admin · manager · senior_sales_executive · sales_executive
--  but the database enum is still the original Phase 2B set:
--      admin · manager · sales
--
--  Migrations `20260522000000_add_sales_role_levels_enum.sql` and
--  `20260522000001_backfill_sales_to_sales_executive.sql` exist for exactly
--  this purpose but evidently never landed in your live database. This file
--  is a defensive, FULLY IDEMPOTENT finalizer — safe to run regardless of
--  which earlier migrations have or haven't been applied.
--
--  ── Why two new files instead of one ───────────────────────────────────────
--  PostgreSQL rule (PG12+): a value added to an enum via ALTER TYPE … ADD
--  VALUE cannot be USED inside the same transaction. The backfill therefore
--  lives in the next migration file so it runs in its own transaction with
--  the new enum values guaranteed-committed.
--
--  ── Idempotency strategy ───────────────────────────────────────────────────
--  We use `ADD VALUE IF NOT EXISTS` (supported in PG12+). On a fresh DB it
--  adds the values; on a DB that already has them it's a no-op. There is no
--  scenario where re-running this migration breaks anything.
-- ============================================================================

alter type public.user_role
  add value if not exists 'senior_sales_executive';

alter type public.user_role
  add value if not exists 'sales_executive';
