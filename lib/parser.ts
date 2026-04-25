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

  // Detect "Discography Report" format (Report Summary + Data sheets, no Summary/Items)
  const isDiscography = workbook.SheetNames.includes('Report Summary') && workbook.SheetNames.includes('Data')
    && !workbook.SheetNames.includes('Summary');
  if (isDiscography) {
    console.log(`[parser] Detected Discography Report format`);
    return parseDiscographyReport(workbook, fileName);
  }

  // Detect "Artist Trend Report" format (Report Summary + Report Page 1 Results)
  const isArtistTrend = workbook.SheetNames.includes('Report Summary') && workbook.SheetNames.includes('Report Page 1 Results')
    && !workbook.SheetNames.includes('Summary');
  if (isArtistTrend) {
    console.log(`[parser] Detected Artist Trend Report format`);
    return parseArtistTrendReport(workbook, fileName);
  }

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
// Discography Report Parser
// Sheets: "Report Summary" (Artist Name, Date, Country, Metric)
//         "Data" (song rows with TP, LP, YTD, ATD columns)
// ============================================================

function parseDiscographyReport(wb: XLSX.WorkBook, _fileName?: string): LuminateDataset {
  // Parse Report Summary
  const rsWs = wb.Sheets['Report Summary'];
  const rsRows: any[][] = XLSX.utils.sheet_to_json(rsWs, { header: 1, defval: null });

  const getRS = (label: string): string => {
    const row = rsRows.find((r) => r[0]?.toString().trim() === label);
    return row?.[1]?.toString().trim() ?? '';
  };

  const artistName = getRS('Artist Name') || 'Unknown Artist';
  const reportDate = getRS('Date');
  const country = getRS('Country');
  const metric = getRS('Metric');

  // Parse Data sheet
  const dataWs = wb.Sheets['Data'];
  const dataRows: any[][] = XLSX.utils.sheet_to_json(dataWs, { header: 1, defval: null });

  // Row 0: title "Artist Discography Report - ArtistName"
  // Row 1: headers ["enm", "TP", "% Chg", "LP", "YTD", "ATD W40 2018"]
  // Row 2+: song data

  const songWeekly: SongWeekly[] = [];
  let totalTP = 0;
  let totalATD = 0;

  for (let i = 2; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (!row || !row[0]) continue;

    const songTitle = String(row[0]).trim();
    if (!songTitle) continue;

    const tp = num(row[1]);     // This Period
    const ytd = num(row[4]);    // YTD
    const atd = num(row[5]);    // ATD

    totalTP += tp;
    totalATD += atd;

    // Create a single "snapshot" week entry for each song
    // We don't have real weekly time series, but we can record the current state
    songWeekly.push({
      location: country === 'G1' ? 'Worldwide' : country,
      entity: 'Song',
      artist: artistName,
      title: songTitle,
      luminateId: `disco-${songTitle.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      activity: metric || 'Streaming On-Demand Audio',
      week: 1,
      year: reportDate ? parseInt(reportDate.split('/')[2]) || 2025 : 2025,
      dateRange: reportDate || '',
      quantity: tp,
      ytd,
      atd,
    });
  }

  // Synthesize a single artist weekly entry from totals
  const reportYear = reportDate ? parseInt(reportDate.split('/')[2]) || 2025 : 2025;
  const artistWeekly: ArtistWeekly[] = [{
    location: country === 'G1' ? 'Worldwide' : country,
    entity: 'Artist',
    artist: artistName,
    luminateId: '',
    activity: metric || 'Streaming On-Demand Audio',
    week: 1,
    year: reportYear,
    dateRange: reportDate || '',
    quantity: totalTP,
    ytd: totalTP,
    atd: totalATD,
  }];

  console.log(`[parser] Discography: ${artistName}, ${songWeekly.length} songs, ATD: ${totalATD.toLocaleString()}`);

  const summary: ReportSummary = {
    reportName: artistName,
    reportGenerated: reportDate,
    reportId: '',
    timeFrame: reportDate || '',
    location: country === 'G1' ? 'Worldwide' : country,
    market: country,
    includedActivities: [metric || 'Streaming On-Demand Audio'],
  };

  return {
    summary,
    catalog: [],
    artistWeekly,
    releaseGroupWeekly: [],
    songWeekly,
  };
}

// ============================================================
// Artist Trend Report Parser
// Sheets: "Report Summary" (Report Name, Entity Type, Activities)
//         "Report Page 1 Results" (pivoted: weeks as columns)
// Row 0: [Artist, "Baby Syko"]
// Row 5: ["", "Week 1 2025 01/03/2025 - 01/09/2025", ...]
// Row 7: ["Total Streaming On-Demand", 661458, 758991, ...]
// Last 3 cols: "Period Total", "% Chg", "YTD (...)", "ATD (...)"
// ============================================================

function parseArtistTrendReport(wb: XLSX.WorkBook, _fileName?: string): LuminateDataset {
  // Parse Report Summary
  const rsWs = wb.Sheets['Report Summary'];
  const rsRows: any[][] = XLSX.utils.sheet_to_json(rsWs, { header: 1, defval: null });

  const getRS = (label: string): string => {
    const row = rsRows.find((r) => r[0]?.toString().trim() === label);
    return row?.[1]?.toString().trim() ?? '';
  };

  const reportName = getRS('Report Name');

  // Parse Report Page 1 Results
  const rWs = wb.Sheets['Report Page 1 Results'];
  const rows: any[][] = XLSX.utils.sheet_to_json(rWs, { header: 1, defval: null });

  // Row 0: ["Artist", "Baby Syko"]
  const artistName = rows[0]?.[1]?.toString().trim() || reportName || 'Unknown Artist';

  // Row 5: week headers
  const headerRow = rows[5] || [];

  // Find the week columns — they match "Week N YYYY MM/DD/YYYY - MM/DD/YYYY"
  // Last 3-4 cols are "Period Total", "% Chg", "YTD (...)", "ATD (...)"
  const weekCols: { col: number; week: number; year: number; dateRange: string }[] = [];
  for (let c = 1; c < headerRow.length; c++) {
    const h = String(headerRow[c] || '');
    const m = h.match(/^Week\s+(\d+)\s+(\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})$/);
    if (m) {
      weekCols.push({
        col: c,
        week: parseInt(m[1]),
        year: parseInt(m[2]),
        dateRange: `${m[3]} - ${m[4]}`,
      });
    }
  }

  // Find the "Total Streaming On-Demand" row (row 7 typically)
  let streamRowIdx = -1;
  for (let r = 6; r < rows.length; r++) {
    const label = String(rows[r]?.[0] || '').trim();
    if (label === 'Total Streaming On-Demand' || label === 'Streaming On-Demand Audio') {
      streamRowIdx = r;
      break;
    }
  }

  if (streamRowIdx === -1) {
    console.log(`[parser] Artist Trend: could not find streaming data row`);
    return { summary: { reportName: artistName, reportGenerated: '', reportId: '', timeFrame: '', location: 'Worldwide', market: '', includedActivities: [] }, catalog: [], artistWeekly: [], releaseGroupWeekly: [], songWeekly: [] };
  }

  const streamRow = rows[streamRowIdx];

  // Build weekly data
  const weeklyData: { week: number; year: number; dateRange: string; quantity: number }[] = [];
  for (const wc of weekCols) {
    const quantity = num(streamRow[wc.col]);
    weeklyData.push({ week: wc.week, year: wc.year, dateRange: wc.dateRange, quantity });
  }

  // Build artist weekly with running YTD/ATD
  const artistWeekly: ArtistWeekly[] = [];
  let atd = 0;
  let ytd = 0;
  let currentYear = weeklyData[0]?.year ?? 0;
  for (const w of weeklyData) {
    if (w.year !== currentYear) { ytd = 0; currentYear = w.year; }
    atd += w.quantity;
    ytd += w.quantity;
    artistWeekly.push({
      location: 'Worldwide',
      entity: 'Artist',
      artist: artistName,
      luminateId: '',
      activity: 'Streams',
      week: w.week,
      year: w.year,
      dateRange: w.dateRange,
      quantity: w.quantity,
      ytd,
      atd,
    });
  }

  console.log(`[parser] Artist Trend: ${artistName}, ${artistWeekly.length} weeks, ATD: ${atd.toLocaleString()}`);

  const summary: ReportSummary = {
    reportName: artistName,
    reportGenerated: '',
    reportId: '',
    timeFrame: weeklyData.length > 0 ? `W${weeklyData[0].week} ${weeklyData[0].year} – W${weeklyData[weeklyData.length-1].week} ${weeklyData[weeklyData.length-1].year}` : '',
    location: 'Worldwide',
    market: '',
    includedActivities: ['Streaming On-Demand'],
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
