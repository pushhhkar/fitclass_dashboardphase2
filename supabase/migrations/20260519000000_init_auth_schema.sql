-- ============================================================================
--  FitClass CRM — Phase 2B — initial auth/persistence schema
--  Migration: 20260519000000_init_auth_schema
-- ============================================================================
--
--  WHY CUSTOM AUTH TABLES (and not Supabase Auth / auth.users):
--    The CRM uses its own credentials + JWT layer (see src/lib/auth/*). Google
--    Sheets remains the lead source-of-truth; Supabase is the system-of-record
--    for *people, permissions, and audit*. Owning the `users` table lets us:
--      - store our own bcrypt password_hash and sign our own JWTs,
--      - model CRM-specific RBAC (role + allowed_branches) directly,
--      - keep zero coupling to Supabase Auth so the auth strategy can evolve
--        without a data migration.
--
--  WHY RLS IS ENABLED NOW (policies later):
--    These tables hold credentials and an audit trail. Enabling Row Level
--    Security immediately means the tables are DENY-BY-DEFAULT the moment they
--    exist — the public `anon`/`authenticated` Supabase roles can read nothing
--    until explicit policies are written in a later migration. Only the
--    server-side service-role client (which bypasses RLS) can touch them in
--    the interim. This removes any window where a misconfigured anon key could
--    leak password hashes or activity history.
--
--  WHY ACTIVITIES USE JSONB:
--    The CRM schema is dynamic (dynamic Sheets columns/tabs). A rigid
--    old/new column pair can't capture arbitrary field changes. jsonb stores
--    the before/after snapshot of whatever changed, is queryable/indexable
--    (GIN-able later), and keeps the audit log forward-compatible as new lead
--    attributes appear without further migrations.
-- ============================================================================

-- gen_random_uuid() lives in pgcrypto. Safe/idempotent on Supabase.
create extension if not exists pgcrypto;

-- ── ENUM: user_role ─────────────────────────────────────────────────────────
-- Mirrors src/features/auth/constants.ts ROLES. Order is privilege-ascending
-- conceptually but enum order is not relied upon for authz (app uses ROLE_RANK).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('admin', 'manager', 'sales');
  end if;
end
$$;

-- ── TABLE: users ────────────────────────────────────────────────────────────
create table if not exists public.users (
  id               uuid primary key default gen_random_uuid(),
  name             text        not null,
  email            text        not null,
  password_hash    text        not null,
  role             user_role   not null default 'sales',
  allowed_branches text[]      not null default '{}'::text[],
  is_active        boolean     not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- Emails are always stored lowercase; the app normalises but the DB enforces.
  constraint users_email_lowercase_chk check (email = lower(email))
);

-- Case-insensitive uniqueness: two rows can never differ only by email case.
create unique index if not exists users_email_lower_uidx
  on public.users (lower(email));

create index if not exists users_email_idx     on public.users (email);
create index if not exists users_role_idx      on public.users (role);
create index if not exists users_is_active_idx on public.users (is_active);

-- ── TABLE: assignments ──────────────────────────────────────────────────────
-- Maps a Google-Sheets lead (lead_id is the external Sheets row key, kept as
-- text since the Sheets engine owns lead identity) to an owning user.
create table if not exists public.assignments (
  id          uuid primary key default gen_random_uuid(),
  lead_id     text        not null,
  assigned_to uuid        not null references public.users (id) on delete cascade,
  assigned_by uuid        not null references public.users (id) on delete restrict,
  assigned_at timestamptz not null default now(),
  notes       text
);

create index if not exists assignments_lead_id_idx     on public.assignments (lead_id);
create index if not exists assignments_assigned_to_idx on public.assignments (assigned_to);

-- ── TABLE: activities ───────────────────────────────────────────────────────
-- Append-only audit log. old_value/new_value are nullable jsonb snapshots so
-- any dynamic lead field change is captured without schema churn.
create table if not exists public.activities (
  id           uuid primary key default gen_random_uuid(),
  lead_id      text        not null,
  action_type  text        not null,
  old_value    jsonb,
  new_value    jsonb,
  performed_by uuid        not null references public.users (id) on delete restrict,
  created_at   timestamptz not null default now()
);

create index if not exists activities_lead_id_idx      on public.activities (lead_id);
create index if not exists activities_action_type_idx  on public.activities (action_type);
create index if not exists activities_performed_by_idx on public.activities (performed_by);
-- Most audit reads are "latest first" — index created_at descending.
create index if not exists activities_created_at_desc_idx
  on public.activities (created_at desc);

-- ── updated_at trigger (users) ──────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
  before update on public.users
  for each row
  execute function public.set_updated_at();

-- ── Row Level Security: ENABLE for all tables, NO policies yet ──────────────
-- Deny-by-default for anon/authenticated. service-role (server) bypasses RLS.
-- Policies are intentionally deferred to a later RBAC migration.
alter table public.users       enable row level security;
alter table public.assignments enable row level security;
alter table public.activities  enable row level security;
