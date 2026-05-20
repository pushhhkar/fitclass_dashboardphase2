import { NextRequest, NextResponse } from 'next/server';
import { fetchLeads, fetchStatusOptions } from '@/lib/sheets';
import { getSpreadsheetId } from '@/lib/dashboard-secrets';
import { SEMANTIC_HEADERS } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const dashboardId = req.nextUrl.searchParams.get('dashboardId');
  const sheetName   = req.nextUrl.searchParams.get('sheet');

  if (!dashboardId || !sheetName) {
    return NextResponse.json({ error: 'dashboardId and sheet params are required' }, { status: 400 });
  }

  try {
    const spreadsheetId = getSpreadsheetId(dashboardId);

    // fetchLeads now returns headers alongside leads — one API call for both.
    const { leads, headers } = await fetchLeads(spreadsheetId, sheetName);

    // Derive Status column index from live headers — no hardcoded offsets.
    const statusColIndex = headers.indexOf(SEMANTIC_HEADERS.status);
    const statusOptions = statusColIndex !== -1
      ? await fetchStatusOptions(spreadsheetId, sheetName, statusColIndex)
      : [];

    return NextResponse.json({ leads, headers, statusOptions });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[GET /api/leads] dashboardId=%s sheet=%s error=%s', dashboardId, sheetName, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
