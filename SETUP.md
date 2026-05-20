# FitClass Leads Dashboard — Setup Guide

## 1. Google Cloud — Create a Service Account

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create (or select) a project
3. Enable the **Google Sheets API**
   - APIs & Services → Library → search "Google Sheets API" → Enable
4. Create a Service Account
   - APIs & Services → Credentials → Create Credentials → Service Account
   - Give it any name (e.g. `fitclass-sheets`)
   - Role: **Editor** (or a custom role with Sheets read/write)
5. Generate a JSON key
   - Click the service account → Keys → Add Key → Create new key → JSON
   - Download the file — keep it safe, never commit it

## 2. Share the Google Sheet

Open your Google Sheet and share it with the service account email:

```
your-sa@your-project.iam.gserviceaccount.com
```

Give it **Editor** access.

## 3. Google Sheet Structure

Each branch tab must have this column layout (row 1 = headers, data from row 2):

| A       | B            | C          | D         | E     | F       | G      | H       |
|---------|--------------|------------|-----------|-------|---------|--------|---------|
| Created | Joining Plan | Membership | Full Name | Phone | Address | Status | Comment |

Tab names must match exactly what's in `lib/config.ts`:
- `Sector 69`
- `Sector 104`
- `Noida`

## 4. Environment Variables

Edit `.env.local` in the project root:

```env
# From the Google Sheets URL: /spreadsheets/d/<ID>/edit
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id_here

# Paste the entire contents of your downloaded JSON key as a single line:
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"..."}

# Optional: polling interval in ms (default 15 seconds)
NEXT_PUBLIC_POLL_INTERVAL_MS=15000
```

**Tip for the JSON value:** Open the key file, select all, copy, then paste between the `=` and end of line. Make sure there are no line breaks outside the JSON.

## 5. Customize Branches

Edit `lib/config.ts` to add, remove, or rename branches:

```ts
export const BRANCHES: Branch[] = [
  { id: 'sector-69', label: 'Sector 69', sheetName: 'Sector 69' },
  { id: 'sector-104', label: 'Sector 104', sheetName: 'Sector 104' },
  { id: 'noida', label: 'Noida', sheetName: 'Noida' },
];
```

`sheetName` must exactly match the tab name in Google Sheets (case-sensitive).

## 6. Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 7. How Sync Works

| Direction | Mechanism |
|---|---|
| Sheet → Dashboard | Polls `/api/leads?sheet=…` every 15 s (configurable via `NEXT_PUBLIC_POLL_INTERVAL_MS`) |
| Dashboard → Sheet | Instant PATCH to `/api/sheets` on every Status/Comment cell edit |

## 8. Adding More Columns

1. Add the field to `types/index.ts` (`Lead` interface)
2. Map it in `lib/sheets.ts` → `fetchLeads()` and add to `SHEET_COLUMNS`
3. Add a `ColDef` entry in `components/LeadsTable.tsx`

To make a new column **editable**, set `editable: true` and add the field name to the `field !== 'status' && field !== 'comment'` guard in `app/api/sheets/route.ts`.
