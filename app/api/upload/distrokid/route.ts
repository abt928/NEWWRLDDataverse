import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';

export const maxDuration = 60;

/** Strip CLONE prefixes, report suffixes, and normalize whitespace */
function normalizeArtistName(raw: string): string {
  let name = raw.trim();
  name = name.replace(/^(CLONE\s+)+/i, '');
  const suffixes = [
    /\s+Artist\s+Report.*$/i,
    /\s+Artist\s+Trend\s+Report.*$/i,
    /\s+Top\s+\d+\s*songs?$/i,
    /\s+Top\s+\d+$/i,
    /\s+ALL\s+\d+$/i,
    /\s+Albums?$/i,
    /\s+Free\s+Songs?$/i,
    /\s+\d+\s*year\s+look\s*back$/i,
    /\s+Activity\s+Over\s+Time.*$/i,
    /\s+Discography\s+Report.*$/i,
  ];
  for (const re of suffixes) name = name.replace(re, '');
  return name.trim() || raw.trim();
}

/** Collapse to pure alphanumeric key for dedup: "Fat Meech" = "FatMeech" = "fatmeech" */
function dedupeKey(name: string): string {
  return normalizeArtistName(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

interface DKEntry {
  saleMonth: string;
  store: string;
  artist: string;
  title: string;
  isrc: string;
  country: string;
  quantity: number;
  earnings: number;
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const { entries, artistName: rawArtistName }: { entries: DKEntry[]; artistName: string } = await req.json();

    if (!entries || !entries.length) {
      return NextResponse.json({ error: 'No entries provided' }, { status: 400 });
    }

    const artistName = normalizeArtistName(rawArtistName);
    const myKey = dedupeKey(artistName);
    console.log(`[dk-upload] ${entries.length} entries for "${rawArtistName}" → normalized: "${artistName}" → key: "${myKey}"`);

    // --- Artist lookup using dedupeKey (matches Luminate upload logic) ---
    const existingArtists = await prisma.artist.findMany();
    let artist = existingArtists.find((a) => dedupeKey(a.name) === myKey) || null;

    if (artist) {
      console.log(`[dk-upload] Found existing artist via dedupeKey: "${artist.name}" (${artist.id})`);
      artist = await prisma.artist.update({
        where: { id: artist.id },
        data: { distrokidUploadedAt: new Date() },
      });
    } else {
      artist = await prisma.artist.create({
        data: { name: artistName, userId, distrokidUploadedAt: new Date() },
      });
      console.log(`[dk-upload] Created new artist: "${artist.name}" (${artist.id})`);
    }

    // --- Bulk insert with skipDuplicates ---
    const createData = entries.map((e) => ({
      artistId: artist!.id,
      saleMonth: e.saleMonth || '',
      store: e.store || '',
      title: e.title || '',
      isrc: e.isrc || '',
      country: e.country || '',
      quantity: e.quantity || 0,
      earnings: e.earnings || 0,
    }));

    const result = await prisma.distroKidMonthly.createMany({
      data: createData,
      skipDuplicates: true,
    });

    console.log(`[dk-upload] ✅ ${result.count} rows inserted (${createData.length - result.count} duplicates skipped)`);

    // --- Track upload for Data Integrity panel ---
    const totalStreams = entries.reduce((s, e) => s + (e.quantity || 0), 0);
    const totalEarnings = entries.reduce((s, e) => s + (e.earnings || 0), 0);
    const months = [...new Set(entries.map(e => e.saleMonth).filter(Boolean))];
    try {
      await prisma.artistUpload.create({
        data: {
          artistId: artist.id,
          fileName: `DistroKid (${months.length} months)`,
          fileType: 'distrokid',
          location: 'Worldwide',
          weekCount: months.length,
          songCount: new Set(entries.map(e => e.isrc || e.title)).size,
          totalStreams: BigInt(totalStreams),
        },
      });
    } catch { /* skip if upload tracking fails */ }

    // --- Post-upload auto-merge: catch any duplicates by dedupeKey ---
    const duplicates = existingArtists.filter(
      (a) => a.id !== artist!.id && dedupeKey(a.name) === myKey
    );

    if (duplicates.length > 0) {
      console.log(`[dk-upload] Found ${duplicates.length} duplicate(s), merging...`);
      for (const dupe of duplicates) {
        // Move all related data from dupe → primary artist
        try {
          const dupeWeekly = await prisma.artistWeekly.findMany({ where: { artistId: dupe.id } });
          for (const w of dupeWeekly) {
            try {
              await prisma.artistWeekly.upsert({
                where: { artistId_location_week_year: { artistId: artist!.id, location: w.location, week: w.week, year: w.year } },
                update: { quantity: w.quantity, ytd: w.ytd, atd: w.atd, dateRange: w.dateRange },
                create: { artistId: artist!.id, location: w.location, week: w.week, year: w.year, dateRange: w.dateRange, quantity: w.quantity, ytd: w.ytd, atd: w.atd },
              });
            } catch { /* skip */ }
          }
          await prisma.artistWeekly.deleteMany({ where: { artistId: dupe.id } });
        } catch { /* skip */ }

        try {
          const dupeSongs = await prisma.song.findMany({ where: { artistId: dupe.id } });
          for (const s of dupeSongs) {
            const exists = await prisma.song.findFirst({ where: { luminateId: s.luminateId, artistId: artist!.id } });
            if (!exists) {
              try { await prisma.song.update({ where: { id: s.id }, data: { artistId: artist!.id } }); } catch { /* skip */ }
            }
          }
          await prisma.songWeekly.deleteMany({ where: { song: { artistId: dupe.id } } });
          await prisma.song.deleteMany({ where: { artistId: dupe.id } });
        } catch { /* skip */ }

        try {
          const dupeRGs = await prisma.releaseGroup.findMany({ where: { artistId: dupe.id } });
          for (const rg of dupeRGs) {
            const exists = await prisma.releaseGroup.findFirst({ where: { luminateId: rg.luminateId, artistId: artist!.id } });
            if (!exists) {
              try { await prisma.releaseGroup.update({ where: { id: rg.id }, data: { artistId: artist!.id } }); } catch { /* skip */ }
            }
          }
          await prisma.releaseGroupWeekly.deleteMany({ where: { releaseGroup: { artistId: dupe.id } } });
          await prisma.releaseGroup.deleteMany({ where: { artistId: dupe.id } });
        } catch { /* skip */ }

        // Move uploads, distrokid, manual revenue, pinned metrics, share links
        try { await prisma.artistUpload.updateMany({ where: { artistId: dupe.id }, data: { artistId: artist!.id } }); } catch { /* skip */ }
        try { await prisma.distroKidMonthly.updateMany({ where: { artistId: dupe.id }, data: { artistId: artist!.id } }); } catch { /* skip */ }
        try { await prisma.manualRevenue.updateMany({ where: { artistId: dupe.id }, data: { artistId: artist!.id } }); } catch { /* skip */ }
        try { await prisma.pinnedMetric.updateMany({ where: { artistId: dupe.id }, data: { artistId: artist!.id } }); } catch { /* skip */ }
        try { await prisma.shareLink.updateMany({ where: { artistId: dupe.id }, data: { artistId: artist!.id } }); } catch { /* skip */ }

        await prisma.artist.delete({ where: { id: dupe.id } });
        console.log(`[dk-upload] Merged & deleted duplicate: "${dupe.name}" (${dupe.id})`);
      }
    }

    return NextResponse.json({
      success: true,
      artistId: artist.id,
      artistName: artist.name,
      rowsProcessed: result.count,
      merged: duplicates.length,
    });
  } catch (error) {
    console.error('[dk-upload] ❌ FAILED:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
