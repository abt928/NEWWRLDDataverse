// Direct DB upload — bypasses API auth
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import * as fs from 'fs';
import * as path from 'path';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL required');
const adapter = new PrismaNeon({ connectionString });
const prisma = new PrismaClient({ adapter });

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
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
function isCollab(credit: string) { return COLLAB_SEPARATORS.test(credit); }
function splitCredit(credit: string) { return credit.split(COLLAB_SEPARATORS).map(s => s.trim()).filter(Boolean); }
function soloKeyFn(name: string) { return name.toLowerCase().replace(/[^a-z0-9]/g, ''); }

async function main() {
  const csvPath = path.resolve(__dirname, '../../results-2.csv');
  console.log('Reading CSV...');
  const text = fs.readFileSync(csvPath, 'utf-8');
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  console.log(`${lines.length} lines`);

  const headers = parseCSVLine(lines[0]);
  interface Entry { saleMonth: string; store: string; artist: string; title: string; isrc: string; country: string; quantity: number; earnings: number; teamPercentage: number; }
  const entries: Entry[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    if (fields.length < 14) continue;
    const getField = (name: string) => { const idx = headers.indexOf(name); return idx >= 0 ? (fields[idx] ?? '') : ''; };
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

  // Split by artist
  const soloStreams = new Map<string, number>();
  const soloCanonical = new Map<string, string>();
  for (const e of entries) {
    if (!isCollab(e.artist)) {
      const key = soloKeyFn(e.artist);
      soloStreams.set(key, (soloStreams.get(key) || 0) + e.quantity);
      if (!soloCanonical.has(key)) soloCanonical.set(key, e.artist);
    }
  }

  const grouped = new Map<string, Entry[]>();
  for (const e of entries) {
    if (!isCollab(e.artist)) {
      const key = soloKeyFn(e.artist);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(e);
    } else {
      const parts = splitCredit(e.artist);
      let bestKey = '', bestStreams = -1;
      for (const part of parts) {
        const key = soloKeyFn(part);
        const streams = soloStreams.get(key) ?? -1;
        if (streams > bestStreams) { bestStreams = streams; bestKey = key; }
      }
      if (bestKey && soloCanonical.has(bestKey)) {
        if (!grouped.has(bestKey)) grouped.set(bestKey, []);
        grouped.get(bestKey)!.push(e);
      } else {
        const firstName = parts[0] || e.artist;
        const key = soloKeyFn(firstName);
        if (!soloCanonical.has(key)) soloCanonical.set(key, firstName);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(e);
      }
    }
  }

  console.log(`Split into ${grouped.size} artist groups`);

  // Find existing artists
  const existingArtists = await prisma.artist.findMany();

  for (const [key, artistEntries] of grouped.entries()) {
    const artistName = soloCanonical.get(key) || key;
    let artist = existingArtists.find(a => soloKeyFn(a.name) === key);

    if (!artist) {
      // Find a user to attribute this to
      const users = await prisma.user.findMany({ take: 1 });
      if (!users.length) { console.error('No users found!'); return; }
      artist = await prisma.artist.create({
        data: { name: artistName, userId: users[0].id, distrokidUploadedAt: new Date() },
      });
      console.log(`Created new artist: ${artistName} (${artist.id})`);
    } else {
      await prisma.artist.update({
        where: { id: artist.id },
        data: { distrokidUploadedAt: new Date() },
      });
    }

    const BATCH_SIZE = 2000;
    const totalBatches = Math.ceil(artistEntries.length / BATCH_SIZE);
    console.log(`\nUploading ${artistName}: ${artistEntries.length} entries (${totalBatches} batches)`);

    for (let i = 0; i < artistEntries.length; i += BATCH_SIZE) {
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const batch = artistEntries.slice(i, i + BATCH_SIZE);

      const createData = batch.map(e => ({
        artistId: artist!.id,
        saleMonth: e.saleMonth || '',
        store: e.store || '',
        title: e.title || '',
        isrc: e.isrc || '',
        country: e.country || '',
        quantity: e.quantity || 0,
        earnings: e.earnings || 0,
        teamPercentage: e.teamPercentage ?? 100,
      }));

      const result = await prisma.distroKidMonthly.createMany({
        data: createData,
        skipDuplicates: true,
      });
      process.stdout.write(`  Batch ${batchNum}/${totalBatches}: ${result.count} rows inserted\n`);
    }
  }

  await prisma.$disconnect();
  console.log('\nDone!');
}

main().catch(console.error);
