-- ============================================================================
--  Password rotation + forced-change support
--  Migration: 20260525000000_password_rotation
-- ============================================================================
--
--  WHY THESE COLUMNS
--    The CRM signs its own stateless JWTs (HS256, 7-day expiry). Until now a
--    password reset did NOT invalidate already-issued tokens — a stolen or
--    stale cookie kept working until natural expiry. These two columns close
--    that gap WITHOUT introducing a server-side session store:
--
--    password_changed_at
--      Epoch watermark for "when did this user's password last change".
--      Each minted JWT embeds a `pwd_iat` claim = the password_changed_at at
--      sign time. The session resolver rejects any token whose pwd_iat is
--      OLDER than the current column value. Resetting a password bumps this
--      timestamp, so every previously-issued token is invalidated on its next
--      request — no revocation list needed.
--
--    force_password_change
--      When true, the user is allowed to authenticate but is routed to the
--      change-password screen before reaching any protected surface. Set when
--      an admin sets/resets a password; cleared once the user picks their own.
--
--  BACKFILL
--    Existing rows get password_changed_at = now() (so their CURRENT sessions,
--    which carry no pwd_iat, are treated as stale on next request and the user
--    re-authenticates once) and force_password_change = false (no surprise
--    lockouts for already-onboarded users).
-- ============================================================================

alter table public.users
  add column if not exists password_changed_at timestamptz not null default now();

alter table public.users
  add column if not exists force_password_change boolean not null default false;

comment on column public.users.password_changed_at is
  'Watermark for JWT pwd_iat invalidation. Tokens minted before this instant are rejected.';
comment on column public.users.force_password_change is
  'When true, user must set a new password before accessing protected routes.';
