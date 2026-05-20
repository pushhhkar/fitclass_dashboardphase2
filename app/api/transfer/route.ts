import { NextRequest, NextResponse } from 'next/server';
import { transferLead } from '@/lib/sheets';
import { getSpreadsheetId } from '@/lib/dashboard-secrets';
import type { TransferPayload } from '@/types';

export async function POST(req: NextRequest) {
  let body: TransferPayload;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { lead, targetSheetName, sourceSheetName, dashboardId } = body;

  if (!lead || !targetSheetName || !sourceSheetName || !dashboardId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (targetSheetName === sourceSheetName) {
    return NextResponse.json({ error: 'Target and source sheet cannot be the same' }, { status: 400 });
  }

  try {
    const spreadsheetId = getSpreadsheetId(dashboardId);
    await transferLead({ lead, targetSheetName, sourceSheetName, dashboardId, spreadsheetId });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[POST /api/transfer]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
