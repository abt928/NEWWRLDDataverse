import JSZip from 'jszip';
import type { DistroKidEntry, DistroKidDataset } from './types';

// ============================================================
// Artist Group — one per solo artist found in the data
// ============================================================

export interface ArtistGroup {
  artistName: string;
  entries: DistroKidEntry[];
  dataset: DistroKidDataset;
}

// ============================================================
// DistroKid Parsers
// Handles: .zip (outer .zip → inner .zip(s) → results.csv(s))
//          .csv (flat CSV file with same schema)
//
// Solo artist mentions get their own profile.
// Collab tracks go to the primary solo artist in the credit.
// ============================================================

export async function parseDistroKidZip(buffer: ArrayBuffer): Promise<DistroKidDataset & { artistGroups: ArtistGroup[] }> {
  const outerZip = await JSZip.loadAsync(buffer);
  const allEntries: DistroKidEntry[] = [];

  for (const [filename, file] of Object.entries(outerZip.files)) {
    if (file.dir || !filename.endsWith('.zip')) continue;
    try {
      const innerBuffer = await file.async('arraybuffer');
      const innerZip = await JSZip.loadAsync(innerBuffer);
      for (const [innerName, innerFile] of Object.entries(innerZip.files)) {
        if (innerFile.dir || !innerName.endsWith('.csv')) continue;
        const csvText = await innerFile.async('text');
        allEntries.push(...parseCSV(csvText));
      }
    } catch (err) {
      console.warn(`Skipping ${filename}:`, err);
    }
  }

  const artistGroups = splitByArtist(allEntries);
  const result = aggregateEntries(allEntries);
  return { ...result, rawEntries: allEntries, artistGroups };
}

export async function parseDistroKidCSV(buffer: ArrayBuffer): Promise<DistroKidDataset & { artistGroups: ArtistGroup[] }> {
  const decoder = new TextDecoder('utf-8');
  const text = decoder.decode(buffer);
  const entries = parseCSV(text);
  console.log(`[dk-csv] Parsed ${entries.length} entries from raw CSV`);

  const artistGroups = splitByArtist(entries);
  const result = aggregateEntries(entries);
  return { ...result, rawEntries: entries, artistGroups };
}

// ============================================================
// Multi-Artist Splitting
// 
// 1. Find all "solo" artist names (credits with no separators)
// 2. Each solo artist gets their own profile
// 3. Collab tracks go to whichever solo artist in the credit
//    has the most solo streams (the "primary")
// 4. If a collab has NO recognized solo artist, create one
//    from the first name in the credit
// ============================================================

const COLLAB_SEPARATORS = /,\s*|\s+&\s+|\s+[xX]\s+|\s+and\s+/i;

function isCollab(credit: string): boolean {
  return COLLAB_SEPARATORS.test(credit);
}

function splitCredit(credit: string): string[] {
  return credit.split(COLLAB_SEPARATORS).map(s => s.trim()).filter(Boolean);
}

function splitByArtist(entries: DistroKidEntry[]): ArtistGroup[] {
  // Step 1: Find all solo artist names and their total solo streams
  const soloStreams = new Map<string, number>();
  const soloKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const e of entries) {
    if (!isCollab(e.artist)) {
      const key = soloKey(e.artist);
      soloStreams.set(key, (soloStreams.get(key) || 0) + e.quantity);
    }
  }

  // Build a map of soloKey → canonical name (the exact casing from the data)
  const soloCanonical = new Map<string, string>();
  for (const e of entries) {
    if (!isCollab(e.artist)) {
      const key = soloKey(e.artist);
      if (!soloCanonical.has(key)) {
        soloCanonical.set(key, e.artist);
      }
    }
  }

  console.log(`[dk-split] Found ${soloCanonical.size} solo artists: ${[...soloCanonical.values()].join(', ')}`);

  // Step 2: For each entry, determine which solo artist it belongs to
  const grouped = new Map<string, DistroKidEntry[]>(); // soloKey → entries

  for (const e of entries) {
    if (!isCollab(e.artist)) {
      // Solo entry → goes to its own artist
      const key = soloKey(e.artist);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(e);
    } else {
      // Collab entry → find which solo artist in the credit has the most streams
      const parts = splitCredit(e.artist);
      let bestKey = '';
      let bestStreams = -1;

      for (const part of parts) {
        const key = soloKey(part);
        const streams = soloStreams.get(key) ?? -1;
        if (streams > bestStreams) {
          bestStreams = streams;
          bestKey = key;
        }
      }

      if (bestKey && soloCanonical.has(bestKey)) {
        // Attribute to the primary solo artist
        if (!grouped.has(bestKey)) grouped.set(bestKey, []);
        grouped.get(bestKey)!.push(e);
      } else {
        // No recognized solo artist — use first name in credit
        const firstName = parts[0] || e.artist;
        const key = soloKey(firstName);
        if (!soloCanonical.has(key)) {
          soloCanonical.set(key, firstName);
        }
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(e);
      }
    }
  }

  // Step 3: Build ArtistGroup for each solo artist
  const groups: ArtistGroup[] = [];
  for (const [key, artistEntries] of grouped.entries()) {
    const name = soloCanonical.get(key) || key;
    const dataset = aggregateEntries(artistEntries);
    groups.push({ artistName: name, entries: artistEntries, dataset: { ...dataset, artistName: name, rawEntries: artistEntries } });
    console.log(`[dk-split]   ${name}: ${artistEntries.length} entries, ${dataset.totalStreams.toLocaleString()} streams, $${dataset.totalEarnings.toFixed(2)}`);
  }

  // Sort by earnings descending (primary artist first)
  groups.sort((a, b) => b.dataset.totalEarnings - a.dataset.totalEarnings);

  return groups;
}

// ============================================================
// CSV Parser — handles quoted fields with commas
// ============================================================

function parseCSV(text: string): DistroKidEntry[] {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  // Parse header
  const headers = parseCSVLine(lines[0]);
  const entries: DistroKidEntry[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    if (fields.length < 14) continue;

    const getField = (name: string): string => {
      const idx = headers.indexOf(name);
      return idx >= 0 ? (fields[idx] ?? '') : '';
    };

    const quantity = parseFloat(getField('Quantity')) || 0;
    const earnings = parseFloat(getField('Earnings (USD)')) || 0;

    // Skip rows with no streams and no earnings
    if (quantity === 0 && earnings === 0) continue;

    entries.push({
      reportingDate: getField('Reporting Date'),
      saleMonth: getField('Sale Month'),
      store: getField('Store'),
      artist: getField('Artist'),
      title: getField('Title'),
      isrc: getField('ISRC'),
      upc: getField('UPC'),
      quantity,
      teamPercentage: parseFloat(getField('Team Percentage')) || 100,
      sourceType: getField('Source Type'),
      country: getField('Country of Sale'),
      songwriterRoyaltiesWithheld: parseFloat(getField('Songwriter Royalties Withheld (USD)')) || 0,
      earnings,
    });
  }

  return entries;
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

// ============================================================
// Aggregation — transforms raw entries into analytics dataset
// ============================================================

function aggregateEntries(entries: DistroKidEntry[]): DistroKidDataset {
  // Find artist name (most common)
  const artistCounts = new Map<string, number>();
  for (const e of entries) {
    artistCounts.set(e.artist, (artistCounts.get(e.artist) || 0) + e.quantity);
  }
  const artistName = Array.from(artistCounts.entries())
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Unknown';

  // Totals
  const totalEarnings = entries.reduce((s, e) => s + e.earnings, 0);
  const totalStreams = entries.reduce((s, e) => s + e.quantity, 0);

  // Date range
  const months = entries.map((e) => e.saleMonth).filter(Boolean).sort();
  const dateRange: [string, string] = [months[0] ?? '', months[months.length - 1] ?? ''];

  // Monthly revenue
  const monthMap = new Map<string, { earnings: number; streams: number }>();
  for (const e of entries) {
    if (!e.saleMonth) continue;
    const existing = monthMap.get(e.saleMonth) || { earnings: 0, streams: 0 };
    existing.earnings += e.earnings;
    existing.streams += e.quantity;
    monthMap.set(e.saleMonth, existing);
  }
  const monthlyRevenue = Array.from(monthMap.entries())
    .map(([month, data]) => ({
      month,
      earnings: Math.round(data.earnings * 100) / 100,
      streams: data.streams,
      effectiveCpm: data.streams > 0 ? Math.round((data.earnings / data.streams) * 1000 * 100) / 100 : 0,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // Platform breakdown
  const platformMap = new Map<string, { earnings: number; streams: number }>();
  for (const e of entries) {
    const existing = platformMap.get(e.store) || { earnings: 0, streams: 0 };
    existing.earnings += e.earnings;
    existing.streams += e.quantity;
    platformMap.set(e.store, existing);
  }
  const platformBreakdown = Array.from(platformMap.entries())
    .map(([store, data]) => ({
      store,
      earnings: Math.round(data.earnings * 100) / 100,
      streams: data.streams,
      cpm: data.streams > 0 ? Math.round((data.earnings / data.streams) * 1000 * 100) / 100 : 0,
      pct: totalEarnings > 0 ? Math.round((data.earnings / totalEarnings) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.earnings - a.earnings);

  // Song earnings
  const songMap = new Map<string, { title: string; artist: string; isrc: string; earnings: number; streams: number }>();
  for (const e of entries) {
    const key = e.isrc || `${e.title}__${e.artist}`;
    const existing = songMap.get(key) || { title: e.title, artist: e.artist, isrc: e.isrc, earnings: 0, streams: 0 };
    existing.earnings += e.earnings;
    existing.streams += e.quantity;
    songMap.set(key, existing);
  }
  const songEarnings = Array.from(songMap.values())
    .map((s) => ({
      ...s,
      earnings: Math.round(s.earnings * 100) / 100,
      cpm: s.streams > 0 ? Math.round((s.earnings / s.streams) * 1000 * 100) / 100 : 0,
    }))
    .sort((a, b) => b.earnings - a.earnings);

  // Country breakdown
  const countryMap = new Map<string, { earnings: number; streams: number }>();
  for (const e of entries) {
    if (!e.country) continue;
    const existing = countryMap.get(e.country) || { earnings: 0, streams: 0 };
    existing.earnings += e.earnings;
    existing.streams += e.quantity;
    countryMap.set(e.country, existing);
  }
  const countryBreakdown = Array.from(countryMap.entries())
    .map(([country, data]) => ({
      country,
      earnings: Math.round(data.earnings * 100) / 100,
      streams: data.streams,
    }))
    .sort((a, b) => b.earnings - a.earnings);

  return {
    totalEarnings: Math.round(totalEarnings * 100) / 100,
    totalStreams,
    dateRange,
    artistName,
    monthlyRevenue,
    platformBreakdown,
    songEarnings,
    countryBreakdown,
  };
}
