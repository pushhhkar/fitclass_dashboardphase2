-- ============================================================================
--  FitClass CRM — Phase 2Q — backfill legacy 'sales' rows
--  Migration: 20260524000001_finalize_role_data_backfill
-- ============================================================================
--
--  Companion to 20260524000000. Maps any user whose role is still the legacy
--  enum value 'sales' onto the new 'sales_executive'. Runs in its own
--  transaction (separate file) so the enum value added by the previous
--  migration is guaranteed-committed before this UPDATE references it.
--
--  Idempotent:
--   - WHERE filter ensures only legacy rows are touched.
--   - Re-running on a clean DB updates zero rows (cost: one indexed scan).
--
--  Safe under partial-state recovery:
--   - If the original 20260522 migrations DID apply, this is a no-op.
--   - If they DIDN'T (your case), this brings the table forward.
-- ============================================================================

-- 1. Map any remaining legacy 'sales' rows to the new operational role.
--    No-op if the prior backfill already ran.
update public.users
set role = 'sales_executive'
where role = 'sales';

-- 2. (Optional, for operator visibility) — leave a NOTICE about what happened.
--    Supabase SQL editor and CLI both surface RAISE NOTICE so you can confirm
--    the migration did real work vs. was already a no-op.
do $$
declare
  remaining int;
begin
  select count(*) into remaining from public.users where role = 'sales';
  if remaining = 0 then
    raise notice 'role backfill OK — no legacy ''sales'' rows remain';
  else
    raise warning 'role backfill INCOMPLETE — % rows still on ''sales''',
      remaining;
  end if;
end $$;
