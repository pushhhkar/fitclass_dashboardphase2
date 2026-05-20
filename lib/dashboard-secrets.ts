// SERVER-ONLY — never imported by client components or config.ts.
// Reads env vars at request time inside Node.js where they are always defined.

const SPREADSHEET_IDS: Record<string, string> = {
  'meta-leads':    process.env.GOOGLE_SPREADSHEET_ID_META     ?? '',
  'website-leads': process.env.GOOGLE_SPREADSHEET_ID_WEBSITE  ?? '',
};

export function getSpreadsheetId(dashboardId: string): string {
  const id = SPREADSHEET_IDS[dashboardId];
  if (!id) {
    throw new Error(
      `No spreadsheet ID configured for dashboard "${dashboardId}". ` +
      `Check GOOGLE_SPREADSHEET_ID_META / GOOGLE_SPREADSHEET_ID_WEBSITE in .env.local`
    );
  }
  return id;
}
