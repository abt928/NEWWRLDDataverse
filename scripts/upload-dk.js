// Script to upload results-2.csv with teamPercentage via the API
const fs = require('fs');
const path = require('path');

const API_URL = 'http://localhost:3099/api/upload/distrokid';
const CSV_PATH = path.join(__dirname, '../../results-2.csv');

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
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

const COLLAB_SEPARATORS = /,\s*|\s+&\s+|\s+[xX]\s+|\s+and\s+/i;
function isCollab(credit) { return COLLAB_SEPARATORS.test(credit); }
function splitCredit(credit) { return credit.split(COLLAB_SEPARATORS).map(s => s.trim()).filter(Boolean); }
function soloKey(name) { return name.toLowerCase().replace(/[^a-z0-9]/g, ''); }

async function main() {
  console.log('Reading CSV...');
  const text = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  console.log(`${lines.length} lines`);

  const headers = parseCSVLine(lines[0]);
  const entries = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    if (fields.length < 14) continue;
    const getField = (name) => {
      const idx = headers.indexOf(name);
      return idx >= 0 ? (fields[idx] ?? '') : '';
    };
    const quantity = parseFloat(getField('Quantity')) || 0;
    const earnings = parseFloat(getField('Earnings (USD)')) || 0;
    if (quantity === 0 && earnings === 0) continue;

    entries.push({
      saleMonth: getField('Sale Month'),
      store: getField('Store'),
      artist: getField('Artist'),
      title: getField('Title'),
      isrc: getField('ISRC'),
      country: getField('Country of Sale'),
      quantity,
      earnings,
      teamPercentage: parseFloat(getField('Team Percentage')) || 100,
    });
  }
  console.log(`Parsed ${entries.length} entries`);

  // Split by artist (same logic as distrokid-parser.ts)
  const soloStreams = new Map();
  const soloCanonical = new Map();
  for (const e of entries) {
    if (!isCollab(e.artist)) {
      const key = soloKey(e.artist);
      soloStreams.set(key, (soloStreams.get(key) || 0) + e.quantity);
      if (!soloCanonical.has(key)) soloCanonical.set(key, e.artist);
    }
  }

  const grouped = new Map();
  for (const e of entries) {
    if (!isCollab(e.artist)) {
      const key = soloKey(e.artist);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(e);
    } else {
      const parts = splitCredit(e.artist);
      let bestKey = '', bestStreams = -1;
      for (const part of parts) {
        const key = soloKey(part);
        const streams = soloStreams.get(key) ?? -1;
        if (streams > bestStreams) { bestStreams = streams; bestKey = key; }
      }
      if (bestKey && soloCanonical.has(bestKey)) {
        if (!grouped.has(bestKey)) grouped.set(bestKey, []);
        grouped.get(bestKey).push(e);
      } else {
        const firstName = parts[0] || e.artist;
        const key = soloKey(firstName);
        if (!soloCanonical.has(key)) soloCanonical.set(key, firstName);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(e);
      }
    }
  }

  console.log(`Split into ${grouped.size} artist groups`);

  // Upload each group
  const BATCH_SIZE = 2000;
  for (const [key, artistEntries] of grouped.entries()) {
    const artistName = soloCanonical.get(key) || key;
    const totalBatches = Math.ceil(artistEntries.length / BATCH_SIZE);
    console.log(`\nUploading ${artistName}: ${artistEntries.length} entries (${totalBatches} batches)`);

    for (let i = 0; i < artistEntries.length; i += BATCH_SIZE) {
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const batch = artistEntries.slice(i, i + BATCH_SIZE);
      
      try {
        const res = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entries: batch, artistName }),
        });
        if (res.ok) {
          const result = await res.json();
          process.stdout.write(`  Batch ${batchNum}/${totalBatches}: ${result.rowsProcessed} rows\n`);
        } else {
          console.error(`  Batch ${batchNum} FAILED: ${res.status}`);
        }
      } catch (err) {
        console.error(`  Batch ${batchNum} ERROR:`, err.message);
      }
    }
  }
  console.log('\nDone!');
}

main();
