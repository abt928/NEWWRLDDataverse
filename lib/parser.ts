import * as XLSX from 'xlsx';
import type {
  LuminateDataset,
  ReportSummary,
  CatalogItem,
  ArtistWeekly,
  ReleaseGroupWeekly,
  SongWeekly,
} from './types';

// ============================================================
// Main Parser — accepts an ArrayBuffer from FileReader
// ============================================================

export function parseLuminateWorkbook(buffer: ArrayBuffer): LuminateDataset {
  // Use buffer type for server (Node.js), base64 for browser
  // SheetJS 0.18.5 has a fflate bug with ArrayBuffer — both approaches bypass it
  let workbook;
  if (typeof Buffer !== 'undefined' && Buffer.from) {
    // Server-side: use Node Buffer directly
    workbook = XLSX.read(Buffer.from(buffer), { type: 'buffer' });
  } else {
    // Client-side: convert to base64
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    workbook = XLSX.read(btoa(binary), { type: 'base64' });
  }

  const summary = parseSummarySheet(workbook);
  const catalog = parseCatalogSheet(workbook);
  const artistWeekly = parseArtistSheet(workbook);
  const releaseGroupWeekly = parseReleaseGroupSheet(workbook);
  const songWeekly = parseSongSheet(workbook);

  return { summary, catalog, artistWeekly, releaseGroupWeekly, songWeekly };
}

// ============================================================
// Summary Tab
// ============================================================

function parseSummarySheet(wb: XLSX.WorkBook): ReportSummary {
  const ws = wb.Sheets['Summary'];
  if (!ws) throw new Error('Missing "Summary" sheet');

  const rows: (string | null)[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
  });

  const get = (label: string): string => {
    const row = rows.find((r) => r[0]?.trim() === label);
    return row?.[1]?.toString().trim() ?? '';
  };

  // Collect multi-line "Included Activities" block
  const activities: string[] = [];
  let inActivities = false;
  for (const row of rows) {
    const key = row[0]?.trim() ?? '';
    if (key === 'Included Activities') {
      inActivities = true;
      if (row[1]) activities.push(row[1].toString().trim());
      continue;
    }
    if (inActivities) {
      // continuation rows have whitespace-only keys
      if (key === '' || key.match(/^\s+$/)) {
        if (row[1]) activities.push(row[1].toString().trim());
      } else {
        inActivities = false;
      }
    }
  }

  return {
    reportName: get('Report Name'),
    reportGenerated: get('Report Generated'),
    reportId: get('Report ID'),
    timeFrame: get('Time Frame'),
    location: get('Location'),
    market: get('Market'),
    includedActivities: activities.length > 0 ? activities : [get('Included Activities')],
  };
}

// ============================================================
// Items / Catalog Tab
// ============================================================

function parseCatalogSheet(wb: XLSX.WorkBook): CatalogItem[] {
  const ws = wb.Sheets['Items'];
  if (!ws) return [];

  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

  return rows.map((r) => ({
    type: str(r['Type']) as CatalogItem['type'],
    name: str(r['Name']),
    artist: str(r['Artist']),
    releaseType: str(r['Release Type']),
    releaseDate: str(r['Release Date']) || null,
    mainGenre: str(r['Main Genre']),
    luminateId: str(r['Luminate ID']),
  }));
}

// ============================================================
// Artist Tab
// ============================================================

function parseArtistSheet(wb: XLSX.WorkBook): ArtistWeekly[] {
  const ws = wb.Sheets['Artist'];
  if (!ws) return [];

  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

  return rows.map((r) => ({
    location: str(r['Location']),
    entity: str(r['Entity']),
    artist: str(r['Artist']),
    luminateId: str(r['Luminate ID']),
    activity: str(r['Activity']),
    week: num(r['Week']),
    year: num(r['Year']),
    dateRange: str(r['Date']),
    quantity: num(r['Quantity']),
    ytd: numOrNull(r['YTD']),
    atd: numOrNull(r['ATD']),
  }));
}

// ============================================================
// Release Group Tab
// ============================================================

function parseReleaseGroupSheet(wb: XLSX.WorkBook): ReleaseGroupWeekly[] {
  const ws = wb.Sheets['Release Group'];
  if (!ws) return [];

  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

  return rows.map((r) => ({
    location: str(r['Location']),
    entity: str(r['Entity']),
    artist: str(r['Artist']),
    title: str(r['Title']),
    luminateId: str(r['Luminate ID']),
    activity: str(r['Activity']),
    releaseType: str(r['Release Type']),
    week: num(r['Week']),
    year: num(r['Year']),
    dateRange: str(r['Date']),
    quantity: num(r['Quantity']),
    ytd: numOrNull(r['YTD']),
    atd: numOrNull(r['ATD']),
  }));
}

// ============================================================
// Song Tab
// ============================================================

function parseSongSheet(wb: XLSX.WorkBook): SongWeekly[] {
  const ws = wb.Sheets['Song'];
  if (!ws) return [];

  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

  return rows.map((r) => ({
    location: str(r['Location']),
    entity: str(r['Entity']),
    artist: str(r['Artist']),
    title: str(r['Title']),
    luminateId: str(r['Luminate ID']),
    activity: str(r['Activity']),
    week: num(r['Week']),
    year: num(r['Year']),
    dateRange: str(r['Date']),
    quantity: num(r['Quantity']),
    ytd: numOrNull(r['YTD']),
    atd: numOrNull(r['ATD']),
  }));
}

// ============================================================
// Helpers
// ============================================================

function str(val: unknown): string {
  if (val === null || val === undefined || val === '') return '';
  return String(val).trim();
}

function num(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

function numOrNull(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}
