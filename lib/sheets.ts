import { google } from 'googleapis';
import { SEMANTIC_HEADERS } from './config';
import type { Lead, UpdatePayload, TransferPayload } from '@/types';

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env variable is not set');
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function getSheets() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

function sheetRange(name: string, suffix: string): string {
  const escaped = name.replace(/'/g, "\\'");
  return `'${escaped}'!${suffix}`;
}

function columnLetter(index: number): string {
  let letter = '';
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

// ── Header row discovery ──────────────────────────────────────────────────────
// Returns the exact header strings from Row 1, in sheet column order.
export async function fetchSheetHeaders(
  spreadsheetId: string,
  sheetName: string
): Promise<string[]> {
  if (!spreadsheetId) throw new Error('spreadsheetId is required');
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetRange(sheetName, 'A1:ZZ1'),
  });
  return (res.data.values?.[0] ?? []).map((v) => String(v).trim()).filter(Boolean);
}

// ── Tab discovery ─────────────────────────────────────────────────────────────
export async function fetchTabNames(spreadsheetId: string): Promise<string[]> {
  if (!spreadsheetId) throw new Error('spreadsheetId is required');
  const sheets = getSheets();
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title',
  });
  const seen = new Set<string>();
  return (res.data.sheets ?? [])
    .map((s) => s.properties?.title ?? '')
    .filter((title) => {
      if (!title || seen.has(title)) return false;
      seen.add(title);
      return true;
    });
}

// ── Status dropdown options from data validation ──────────────────────────────
// Finds the Status column by header name, then reads ONE_OF_LIST validation
// from rows 2–200. Returns ALL values exactly as stored in the sheet.
export async function fetchStatusOptions(
  spreadsheetId: string,
  sheetName: string,
  statusColIndex: number  // 0-based; caller derives this from headers
): Promise<string[]> {
  if (!spreadsheetId) throw new Error('spreadsheetId is required');
  const sheets = getSheets();
  const col = columnLetter(statusColIndex);

  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    ranges: [sheetRange(sheetName, `${col}2:${col}200`)],
    fields: 'sheets.data.rowData.values.dataValidation',
    includeGridData: true,
  });

  const rows = res.data.sheets?.[0]?.data?.[0]?.rowData ?? [];
  for (const row of rows) {
    const rule = row.values?.[0]?.dataValidation;
    if (rule?.condition?.type === 'ONE_OF_LIST') {
      const options = (rule.condition.values ?? [])
        .map((v) => String(v.userEnteredValue ?? ''))
        .filter((v) => v !== '');
      if (options.length) return options;
    }
  }
  return [];
}

// ── Dynamic lead fetcher ──────────────────────────────────────────────────────
// Row 1 is always fetched first to get headers. Data rows are mapped purely
// by column position — no hardcoded offsets anywhere. Adding, removing, or
// reordering sheet columns is reflected automatically on the next refresh.
export async function fetchLeads(
  spreadsheetId: string,
  sheetName: string,
): Promise<{ leads: Lead[]; headers: string[] }> {
  if (!spreadsheetId) throw new Error('spreadsheetId is required');
  const sheets = getSheets();

  // Fetch headers + all data rows in one call.
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetRange(sheetName, 'A1:ZZ'),
  });

  const allRows = res.data.values ?? [];
  if (allRows.length === 0) return { leads: [], headers: [] };

  const headers = (allRows[0] as string[]).map((v) => String(v).trim());
  const dataRows = allRows.slice(1).filter((row) =>
    row.some((cell) => typeof cell === 'string' && cell.trim() !== '')
  );

  // Build an index: headerName → column position (first match wins).
  const idx: Record<string, number> = {};
  headers.forEach((h, i) => { if (h && !(h in idx)) idx[h] = i; });

  const S = SEMANTIC_HEADERS;

  const cell = (row: string[], header: string) => (row[idx[header]] ?? '').toString().trim();

  const leads: Lead[] = dataRows.map((row, i) => {
    const rawCells: string[] = headers.map((_, ci) => (row[ci] ?? '').toString());
    return {
      rowIndex:           i + 2,        // 1-based, row 1 is header
      rawCells,                          // full row for dynamic columns
      createdTime:        cell(row as string[], S.date),
      fullName:           cell(row as string[], S.fullName),
      phoneNumber:        cell(row as string[], S.phone),
      email:              cell(row as string[], S.email),
      Status:             cell(row as string[], S.status),
      Comments:           cell(row as string[], S.comments),
      transferTo:         cell(row as string[], S.transferTo),
      // Legacy fields — populated only when the corresponding header exists
      campaignName:       cell(row as string[], 'Campaign') || cell(row as string[], 'Campaign Name'),
      address:            cell(row as string[], 'Address') || cell(row as string[], 'Selected Branch'),
      joiningPlan:        cell(row as string[], 'Plan Selected') || cell(row as string[], 'Joining Plan'),
      membershipInterest: cell(row as string[], 'Membership Selected') || cell(row as string[], 'Membership Interest'),
      fitnessGoal:        cell(row as string[], 'Primary Fitness Goal') || cell(row as string[], 'Fitness Goal'),
      reason:             cell(row as string[], 'Reason') || cell(row as string[], 'Enquiry Reason'),
    };
  });

  return { leads, headers };
}

// ── Update Status or Comments cell ───────────────────────────────────────────
// Locates the target column by fetching headers dynamically.
export async function updateCell(
  payload: UpdatePayload & { spreadsheetId: string }
): Promise<void> {
  const sheets = getSheets();

  // Resolve which header to look for based on field name.
  const S = SEMANTIC_HEADERS;
  const targetHeader = payload.field === 'Status' ? S.status : S.comments;

  // Fetch row 1 to get the column index dynamically.
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: payload.spreadsheetId,
    range: sheetRange(payload.sheetName, 'A1:ZZ1'),
  });
  const headers = (headerRes.data.values?.[0] ?? []).map((v) => String(v).trim());
  const colIndex = headers.indexOf(targetHeader);
  if (colIndex === -1) throw new Error(`Column "${targetHeader}" not found in sheet "${payload.sheetName}"`);

  const colLetter = columnLetter(colIndex);
  const range = sheetRange(payload.sheetName, `${colLetter}${payload.rowIndex}`);

  await sheets.spreadsheets.values.update({
    spreadsheetId: payload.spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[payload.value]] },
  });
}

// ── Transfer lead to another sheet tab ───────────────────────────────────────
// Reads headers of both source and target dynamically. Column order in the
// appended row matches the TARGET sheet's column order exactly.
export async function transferLead(
  payload: TransferPayload & { spreadsheetId: string }
): Promise<void> {
  const sheets = getSheets();
  const { lead, targetSheetName, sourceSheetName, spreadsheetId } = payload;
  const S = SEMANTIC_HEADERS;

  // Fetch both header rows in parallel.
  const [srcHeaderRes, tgtHeaderRes] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: sheetRange(sourceSheetName, 'A1:ZZ1'),
    }),
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: sheetRange(targetSheetName, 'A1:ZZ1'),
    }),
  ]);

  const srcHeaders = (srcHeaderRes.data.values?.[0] ?? []).map((v) => String(v).trim());
  const tgtHeaders = (tgtHeaderRes.data.values?.[0] ?? []).map((v) => String(v).trim());

  // Build a map of headerName → value from the lead's rawCells.
  const srcValueMap: Record<string, string> = {};
  srcHeaders.forEach((h, i) => { srcValueMap[h] = lead.rawCells?.[i] ?? ''; });

  // Build the new row in TARGET column order, leaving unknown columns blank.
  const newRow: string[] = tgtHeaders.map((h) => {
    if (h === S.transferTo) return '';  // clear Transfer To on the copy
    return srcValueMap[h] ?? '';
  });

  // 1. Append to target sheet.
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: sheetRange(targetSheetName, 'A1'),
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [newRow] },
  });

  // 2. Write target name into Transfer To column of source row.
  const transferToIndex = srcHeaders.indexOf(S.transferTo);
  if (transferToIndex !== -1) {
    const colLetter = columnLetter(transferToIndex);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: sheetRange(sourceSheetName, `${colLetter}${lead.rowIndex}`),
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[targetSheetName]] },
    });
  }
}
