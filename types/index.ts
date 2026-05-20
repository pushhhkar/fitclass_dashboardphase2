export interface Lead {
  rowIndex: number;        // 1-based sheet row

  // Full raw row — every cell in sheet column order.
  // Used by dynamic column rendering and transfer logic.
  rawCells: string[];

  // ── Semantic fields (derived from header name matching) ───────────────────
  // These are populated when the sheet contains a column with the matching
  // header name (see SEMANTIC_HEADERS in lib/config.ts). Empty string when
  // the column doesn't exist in the current sheet.
  createdTime:        string;
  Status:             string;
  Comments:           string;
  transferTo:         string;
  fullName:           string;
  phoneNumber:        string;
  email:              string;    // Website Leads only
  address:            string;    // "Address" (Meta) or "Selected Branch" (Website)
  reason:             string;    // Website Leads only
  campaignName:       string;    // Meta Leads only
  joiningPlan:        string;    // Meta Leads only
  membershipInterest: string;    // Meta Leads only
  fitnessGoal:        string;    // Meta Leads only
}

export interface StatsData {
  total: number;
  lastUpdated: Date | null;
}

export interface UpdatePayload {
  rowIndex: number;
  field: 'Status' | 'Comments';
  value: string;
  dashboardId: string;
  sheetName: string;
}

export interface TransferPayload {
  lead: Lead;
  targetSheetName: string;
  dashboardId: string;
  sourceSheetName: string;
}
