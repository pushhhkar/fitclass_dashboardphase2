/**
 * Canonical lead identifier shared between Google Sheets (source of truth)
 * and the Supabase tables that reference it.
 *
 * Format: `${dashboardId}::${sheetName}::${rowIndex}`
 *
 * Why a composite, not a UUID:
 *  - Leads live in Sheets, not in Supabase. Supabase rows reference them.
 *  - rowIndex alone collides across branches/dashboards; (dashboardId,
 *    sheetName, rowIndex) is globally unique within the CRM.
 *  - Strings travel through `lead_id text` columns without joins or extra
 *    indirection — fast to filter on, easy to inspect.
 *
 * Fragility note: rowIndex shifts if rows are inserted ABOVE an existing
 * row in Sheets. Today the sync path appends-only, so this is safe in
 * practice. A future "stable lead id" column written back to Sheets would
 * eliminate the risk; this helper is the single place to evolve.
 */

const SEPARATOR = '::';

export function makeLeadId(
  dashboardId: string,
  sheetName: string,
  rowIndex: number | string,
): string {
  return `${dashboardId}${SEPARATOR}${sheetName}${SEPARATOR}${rowIndex}`;
}

export interface ParsedLeadId {
  dashboardId: string;
  sheetName: string;
  rowIndex: number;
}

export function parseLeadId(leadId: string): ParsedLeadId | null {
  const parts = leadId.split(SEPARATOR);
  if (parts.length !== 3) return null;
  const [dashboardId, sheetName, rowStr] = parts;
  const rowIndex = Number.parseInt(rowStr, 10);
  if (!dashboardId || !sheetName || !Number.isFinite(rowIndex)) return null;
  return { dashboardId, sheetName, rowIndex };
}
