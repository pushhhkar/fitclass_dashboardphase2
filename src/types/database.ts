/**
 * Database row types — the exact shape of rows in Supabase/Postgres.
 *
 * Kept separate from `src/types/auth.ts`:
 *  - `auth.ts` = what the *app* passes around (SessionUser has NO password).
 *  - `database.ts` = what the *table* physically stores (DatabaseUser DOES
 *    have password_hash). Serializers (src/features/users/serializers.ts)
 *    translate DB rows → safe app shapes so secrets never leak by accident.
 *
 * `UserRole` is re-exported from the single source of truth (the ROLES tuple)
 * so the DB type and the auth type can never drift apart.
 */
import type { UserRole } from '@/src/types/auth';

export type { UserRole };

/** Arbitrary JSON value — used for the dynamic activity snapshots (jsonb). */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** A row of public.users exactly as stored (includes the password hash). */
export interface DatabaseUser {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  allowed_branches: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Columns required to insert a user (DB fills id/timestamps/defaults). */
export interface DatabaseUserInsert {
  name: string;
  email: string;
  password_hash: string;
  role?: UserRole;
  allowed_branches?: string[];
  is_active?: boolean;
}

/** Patchable user columns (id/email/timestamps are not mass-assignable). */
export interface DatabaseUserUpdate {
  name?: string;
  password_hash?: string;
  role?: UserRole;
  allowed_branches?: string[];
  is_active?: boolean;
}

/** A row of public.assignments. lead_id is the external Google-Sheets key. */
export interface Assignment {
  id: string;
  lead_id: string;
  assigned_to: string;
  assigned_by: string;
  assigned_at: string;
  notes: string | null;
}

export interface AssignmentInsert {
  lead_id: string;
  assigned_to: string;
  assigned_by: string;
  notes?: string | null;
}

/** A row of public.activities — append-only audit entry. */
export interface Activity {
  id: string;
  lead_id: string;
  action_type: string;
  old_value: JsonValue | null;
  new_value: JsonValue | null;
  performed_by: string;
  created_at: string;
}

export interface ActivityInsert {
  lead_id: string;
  action_type: string;
  old_value?: JsonValue | null;
  new_value?: JsonValue | null;
  performed_by: string;
}
