-- ============================================================================
--  FitClass CRM — Phase 2H — split 'sales' into two role levels
--  Migration: 20260522000000_add_sales_role_levels_enum
-- ============================================================================
--
--  Phase 2H replaces the single 'sales' role with two levels:
--    - sales_executive          (individual contributor)
--    - senior_sales_executive   (higher-rank IC)
--
--  PostgreSQL does NOT allow dropping enum values cleanly without rebuilding
--  the type, so we ADD the new values and leave 'sales' in place (deprecated).
--  Application code stops emitting 'sales'; the next migration backfills any
--  existing rows whose role is still 'sales'.
--
--  IMPORTANT: ALTER TYPE ... ADD VALUE cannot be USED inside the same
--  transaction it was created in (PG >= 12). The backfill therefore lives
--  in a SEPARATE migration file (20260522000001) so it runs in its own
--  transaction with the new values already committed.
-- ============================================================================

alter type user_role add value if not exists 'senior_sales_executive';
alter type user_role add value if not exists 'sales_executive';
