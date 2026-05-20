// Client-safe config — NO spreadsheetIds here.
// Secrets live in lib/dashboard-secrets.ts.

export interface Dashboard {
  id: string;
  name: string;
}

export const DASHBOARDS: Dashboard[] = [
  { id: 'meta-leads',    name: 'Meta Leads' },
  { id: 'website-leads', name: 'Website Leads' },
];

// ── Semantic column names ─────────────────────────────────────────────────────
// These are the exact header strings the code recognises for special behaviour.
// If a sheet uses a different header, the column renders as plain read-only text.
// Change these strings here and everywhere adjusts automatically.
export const SEMANTIC_HEADERS = {
  status:    'Status',
  comments:  'Remarks',
  transferTo:'Transfer To',
  fullName:  'Name',
  phone:     'Phone Number',
  date:      'Date',
  email:     'Email Address',
} as const;
