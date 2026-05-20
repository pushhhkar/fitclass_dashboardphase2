import { NextRequest, NextResponse } from 'next/server';
import { fetchTabNames } from '@/lib/sheets';
import { getSpreadsheetId } from '@/lib/dashboard-secrets';

export const dynamic = 'force-dynamic';

// Returns the live tab names straight from Google Sheets.
// No hardcoded branch list — dashboard auto-discovers tabs.
export async function GET(req: NextRequest) {
  const dashboardId = req.nextUrl.searchParams.get('dashboardId');

  if (!dashboardId) {
    return NextResponse.json({ error: 'dashboardId param is required' }, { status: 400 });
  }

  try {
    const spreadsheetId = getSpreadsheetId(dashboardId);
    const tabs = await fetchTabNames(spreadsheetId);
    return NextResponse.json(tabs);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[GET /api/branches] dashboardId=%s error=%s', dashboardId, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
