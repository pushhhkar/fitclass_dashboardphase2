/**
 * User READ layer.
 *
 * SERVER-ONLY. Every call goes through `supabaseAdmin` (service role) — these
 * tables are RLS deny-by-default, so only the server can read them. Functions
 * return raw `DatabaseUser` rows; callers decide whether to serialise to a
 * safe shape (see serializers.ts). Errors are normalised via DatabaseError so
 * the rest of the app never sees a PostgrestError.
 */
import { supabaseAdmin } from '@/src/lib/db/supabase';
import { fromPostgrestError } from '@/src/lib/db/errors';
import type { DatabaseUser } from '@/src/types/database';

const USERS_TABLE = 'users';

// The shared client is intentionally untyped (no generated Database generic
// yet). We assert the row shape at this single data-access boundary so the
// rest of the app stays fully typed without `any`. When `supabase gen types`
// is introduced, these casts can be removed wholesale.
function asUser(row: unknown): DatabaseUser {
  return row as DatabaseUser;
}
function asUsers(rows: unknown): DatabaseUser[] {
  return (rows as DatabaseUser[] | null) ?? [];
}

/**
 * Look up a user by email. Email is normalised to lowercase to match the
 * DB's case-insensitive uniqueness. Returns null when absent (not an error).
 */
export async function getUserByEmail(
  email: string,
): Promise<DatabaseUser | null> {
  const normalised = email.trim().toLowerCase();

  const { data, error } = await supabaseAdmin
    .from(USERS_TABLE)
    .select('*')
    .eq('email', normalised)
    .maybeSingle();

  if (error) throw fromPostgrestError(error);
  return data ? asUser(data) : null;
}

/** Look up a user by primary id. Returns null when absent. */
export async function getUserById(id: string): Promise<DatabaseUser | null> {
  const { data, error } = await supabaseAdmin
    .from(USERS_TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw fromPostgrestError(error);
  return data ? asUser(data) : null;
}

/** List users (newest first). Pagination can be layered on later. */
export async function listUsers(): Promise<DatabaseUser[]> {
  const { data, error } = await supabaseAdmin
    .from(USERS_TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw fromPostgrestError(error);
  return asUsers(data);
}

/**
 * Count active admins. Used by the seed script for idempotency and (later) to
 * guard against demoting/deactivating the last admin.
 */
export async function countActiveAdmins(): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from(USERS_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
    .eq('is_active', true);

  if (error) throw fromPostgrestError(error);
  return count ?? 0;
}
