-- ============================================================================
--  FitClass CRM — Phase 2E — activities audit extensions
--  Migration: 20260520000000_activities_audit_extensions
-- ============================================================================
--
--  Phase 2B created `activities` as a per-lead audit log. Phase 2E broadens
--  it into the system-wide audit log (auth + user management + assignments),
--  which requires two relaxations and one new column:
--
--   1. `lead_id` is now NULLABLE.
--      Auth and user-management events (login_success, user_created, ...)
--      have no lead context. Keeping the column NOT NULL would force callers
--      to invent a sentinel string, which is worse than honest NULL.
--
--   2. `performed_by` is now NULLABLE.
--      A `login_failure` for an unknown email has no actor we can name.
--      The existing ON DELETE RESTRICT foreign-key behaviour is unchanged —
--      a known user still cannot be deleted while activities reference them.
--
--   3. NEW column `subject_user_id` (uuid, nullable, FK → users.id ON DELETE
--      SET NULL). For user-management events this is the user being acted on
--      (target of user_created / user_updated / user_deactivated / etc.).
--      `performed_by` stays the actor; the two together let admin-audit
--      queries answer "who did what to whom, when".
-- ============================================================================

alter table public.activities
  alter column lead_id drop not null;

alter table public.activities
  alter column performed_by drop not null;

alter table public.activities
  add column if not exists subject_user_id uuid
  references public.users (id) on delete set null;

create index if not exists activities_subject_user_id_idx
  on public.activities (subject_user_id);
