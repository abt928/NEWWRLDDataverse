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

export function parseLuminateWorkbook(buffer: ArrayBuffer, fileName?: string): LuminateDataset {
  let workbook;
  if (typeof Buffer !== 'undefined' && Buffer.from) {
    workbook = XLSX.read(Buffer.from(buffer), { type: 'buffer' });
  } else {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    workbook = XLSX.read(btoa(binary), { type: 'base64' });
  }

  console.log(`[parser] Sheets found: ${workbook.SheetNames.join(', ')}`);

  // Detect "Trends"-only format (Activity Over Time export)
  const isTrendsOnly = workbook.SheetNames.includes('Trends') && !workbook.SheetNames.includes('Summary');

  if (isTrendsOnly) {
    console.log(`[parser] Detected Trends-only format (Activity Over Time)`);
    return parseTrendsOnlyWorkbook(workbook, fileName);
  }

  const summary = parseSummarySheet(workbook);
  const catalog = parseCatalogSheet(workbook);
  let artistWeekly = parseArtistSheet(workbook);
  const releaseGroupWeekly = parseReleaseGroupSheet(workbook);
  const songWeekly = parseSongSheet(workbook);

  // If no Artist sheet, synthesize artist-level weekly by aggregating song weekly data
  if (artistWeekly.length === 0 && songWeekly.length > 0) {
    console.log(`[parser] No Artist sheet — synthesizing from ${songWeekly.length} song weekly rows`);
    const artistItem = catalog.find((c) => c.type === 'Artist');
    const artistName = artistItem?.name || summary.reportName || 'Unknown';
    const artistLuminateId = artistItem?.luminateId || '';

    const weekMap = new Map<string, { week: number; year: number; dateRange: string; quantity: number }>();
    for (const row of songWeekly) {
      const key = `${row.year}-${row.week}`;
      const existing = weekMap.get(key);
      if (existing) {
        existing.quantity += row.quantity;
      } else {
        weekMap.set(key, { week: row.week, year: row.year, dateRange: row.dateRange, quantity: row.quantity });
      }
    }

    const sorted = Array.from(weekMap.values()).sort((a, b) => a.year !== b.year ? a.year - b.year : a.week - b.week);
    let atd = 0;
    let ytd = 0;
    let currentYear = sorted[0]?.year ?? 0;
    artistWeekly = sorted.map((w) => {
      if (w.year !== currentYear) { ytd = 0; currentYear = w.year; }
      atd += w.quantity;
      ytd += w.quantity;
      return {
        location: 'Worldwide',
        entity: 'Artist',
        artist: artistName,
        luminateId: artistLuminateId,
        activity: 'Streams',
        week: w.week,
        year: w.year,
        dateRange: w.dateRange,
        quantity: w.quantity,
        ytd,
        atd,
      };
    });
    console.log(`[parser] Synthesized ${artistWeekly.length} artist weekly rows (ATD: ${atd})`);
  }

  console.log(`[parser] Parsed: summary=${summary.reportName}, catalog=${catalog.length}, artistWeekly=${artistWeekly.length}, rgWeekly=${releaseGroupWeekly.length}, songWeekly=${songWeekly.length}`);

  return { summary, catalog, artistWeekly, releaseGroupWeekly, songWeekly };
}

// ============================================================
// Trends-Only Parser (Activity Over Time export)
// ============================================================

function parseTrendsOnlyWorkbook(wb: XLSX.WorkBook, fileName?: string): LuminateDataset {
  const ws = wb.Sheets['Trends'];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // Extract artist name from filename: "DelKomando_Activity Over Time_..."
  let artistName = 'Unknown Artist';
  if (fileName) {
    const parts = fileName.split('_');
    if (parts.length > 0) artistName = parts[0].replace(/\.xlsx$/i, '');
  }

  // Extract location from row 0: "Custom (Wed, Apr 17 - Thu, Apr 23) - Worldwide"
  const titleRow = String(rows[0]?.[0] || '');
  const locMatch = titleRow.match(/-\s*(.+?)\s*$/);
  const location = locMatch ? locMatch[1].trim() : 'Worldwide';

  // Extract Luminate ID from filename
  const idMatch = fileName?.match(/AR([A-F0-9]{32})/i);
  const luminateId = idMatch ? idMatch[0] : '';

  // Parse data rows (start at row 5, which is the first data row after 4 header rows + row 0 title)
  const artistWeekly: ArtistWeekly[] = [];
  const weeklyData: { week: number; year: number; dateRange: string; quantity: number }[] = [];

  for (let i = 5; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;
    const weekLabel = String(row[0]);
    if (!weekLabel.startsWith('W')) continue;

    // Parse "W16, 2026" → week=16, year=2026
    const wMatch = weekLabel.match(/W(\d+),\s*(\d{4})/);
    if (!wMatch) continue;
    const week = parseInt(wMatch[1]);
    const year = parseInt(wMatch[2]);
    const totalStreams = num(row[2]); // Col 2 = Total Streams

    // Convert Excel date serial to date range string
    let dateRange = '';
    if (row[1] && typeof row[1] === 'number') {
      const parsed = XLSX.SSF.parse_date_code(row[1]);
      const endDate = new Date(parsed.y, parsed.m - 1, parsed.d);
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 6);
      const fmt = (d: Date) => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
      dateRange = `${fmt(startDate)} - ${fmt(endDate)}`;
    }

    weeklyData.push({ week, year, dateRange, quantity: totalStreams });
  }

  // Sort chronologically (oldest first)
  weeklyData.sort((a, b) => a.year !== b.year ? a.year - b.year : a.week - b.week);

  // Build artist weekly with running YTD/ATD
  let atd = 0;
  let ytd = 0;
  let currentYear = weeklyData[0]?.year ?? 0;
  for (const w of weeklyData) {
    if (w.year !== currentYear) { ytd = 0; currentYear = w.year; }
    atd += w.quantity;
    ytd += w.quantity;
    artistWeekly.push({
      location,
      entity: 'Artist',
      artist: artistName,
      luminateId,
      activity: 'Streams',
      week: w.week,
      year: w.year,
      dateRange: w.dateRange,
      quantity: w.quantity,
      ytd,
      atd,
    });
  }

  console.log(`[parser] Trends-only: ${artistWeekly.length} weeks for ${artistName} (ATD: ${atd})`);

  // Create a minimal summary
  const summary: ReportSummary = {
    reportName: artistName,
    reportGenerated: '',
    reportId: '',
    timeFrame: weeklyData.length > 0 ? `W${weeklyData[0].week} ${weeklyData[0].year} – W${weeklyData[weeklyData.length-1].week} ${weeklyData[weeklyData.length-1].year}` : '',
    location,
    market: '',
    includedActivities: ['Streams'],
  };

  return {
    summary,
    catalog: [],
    artistWeekly,
    releaseGroupWeekly: [],
    songWeekly: [],
  };
}

// ============================================================
// Summary Tab
// ============================================================

function parseSummarySheet(wb: XLSX.WorkBook): ReportSummary {
  const ws = wb.Sheets['Summary'];
  if (!ws) {
    return { reportName: '', reportGenerated: '', reportId: '', timeFrame: '', location: 'Worldwide', market: '', includedActivities: [] };
  }

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
