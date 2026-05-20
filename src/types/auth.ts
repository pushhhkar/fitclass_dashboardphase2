/**
 * Shared authentication & RBAC types.
 *
 * Framework-agnostic and dependency-free so it can be imported from anywhere
 * (server, client, Edge, tests) without pulling in heavy modules.
 *
 * The single source of truth for the role union is the `ROLES` tuple in
 * `@/src/features/auth/constants`. `UserRole` is derived from it so adding a
 * role in one place updates the type everywhere — no drift.
 */
import type { ROLES } from '@/src/features/auth/constants';

/** admin | manager | sales — extend via the ROLES tuple, not here. */
export type UserRole = (typeof ROLES)[number];

/**
 * The authenticated user as exposed to application code (server + client).
 * Intentionally minimal — no password hash, no internal columns ever leak
 * into this shape.
 */
export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
  name: string | null;
}

/** Credentials submitted to the (future) login endpoint. */
export interface LoginPayload {
  email: string;
  password: string;
}

/**
 * The signed JWT body. Custom claims are kept flat and minimal to keep the
 * token small. `iat` / `exp` are added/managed by the signing library and are
 * optional on the way in.
 */
export interface JwtPayload {
  /** Subject — the user's primary id. */
  sub: string;
  email: string;
  role: UserRole;
  /** Issued-at (epoch seconds) — set by the signer. */
  iat?: number;
  /** Expiry (epoch seconds) — set by the signer. */
  exp?: number;
}

/** Discriminated result for verification helpers — no throwing on bad tokens. */
export type JwtVerifyResult =
  | { valid: true; payload: JwtPayload }
  | { valid: false; error: string };
