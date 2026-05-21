/**
 * Canonical branch listing — the single SERVER-SIDE source of truth for
 * "what branch names exist in this CRM".
 *
 * ── Why this module exists ──────────────────────────────────────────────────
 * Branches are Google Sheets tab names (e.g. "Indiranagar", "HSR Layout").
 * They are referenced from FOUR places:
 *   1. `/api/leads`        → `?sheet=<branch>` selects a tab
 *   2. `/api/transfer`     → source + target tab names
 *   3. `assignments.branch` (Supabase) → denormalised lead branch
 *   4. `users.allowed_branches` (Supabase) → branch-scope authorization
 *
 * (1) and (2) read live from Sheets; (3) and (4) are stored strings. If those
 * stored strings ever drift from the live tab names (typos, casing, renames),
 * RBAC silently breaks: `canAccessLeadBranch` does an exact string match and
 * a stale "Indiranagar " (trailing space) would deny access to "Indiranagar".
 * So all branch-name INPUTS must be validated against this canonical list at
 * the API boundary. Free-text inputs are forbidden by the UI; the server
 * enforces the same rule defensively.
 *
 * Each dashboard (Meta Leads, Website Leads) is a separate spreadsheet and
 * may have overlapping tab names. We union them and dedupe — the same
 * branch "Indiranagar" present in both spreadsheets appears once in the
 * authorisation list because it's the same physical place.
 */
import { DASHBOARDS } from '@/lib/config';
import { getSpreadsheetId } from '@/lib/dashboard-secrets';
import { fetchTabNames } from '@/lib/sheets';

/**
 * Union of every Sheets tab name across every configured dashboard,
 * deduplicated and alphabetically sorted (stable order for UI consumers).
 */
export async function listAllBranches(): Promise<string[]> {
  const all = new Set<string>();
  for (const dashboard of DASHBOARDS) {
    const spreadsheetId = getSpreadsheetId(dashboard.id);
    const tabs = await fetchTabNames(spreadsheetId);
    for (const tab of tabs) all.add(tab);
  }
  return Array.from(all).sort((a, b) => a.localeCompare(b));
}

export type BranchValidationResult =
  | { ok: true }
  | { ok: false; invalid: string[] };

/**
 * Verify every submitted branch exists in the canonical list. Returns a
 * discriminated union so callers branch cleanly into 400 responses.
 *
 * Empty arrays are accepted (means "unrestricted" per `canAccessLeadBranch`).
 * Whitespace / casing must already be normalised by the caller — this is an
 * EXACT match against the canonical names returned from Sheets.
 */
export async function validateBranches(
  submitted: readonly string[],
): Promise<BranchValidationResult> {
  if (submitted.length === 0) return { ok: true };
  const canonical = new Set(await listAllBranches());
  const invalid = submitted.filter((b) => !canonical.has(b));
  if (invalid.length > 0) return { ok: false, invalid };
  return { ok: true };
}
