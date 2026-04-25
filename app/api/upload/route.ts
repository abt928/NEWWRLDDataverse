import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';
import { parseLuminateWorkbook } from '@/lib/parser';

export const maxDuration = 60;

/** Strip CLONE prefixes, report suffixes, and normalize whitespace */
function normalizeArtistName(raw: string): string {
  let name = raw.trim();
  // Strip leading "CLONE " (may be doubled)
  name = name.replace(/^(CLONE\s+)+/i, '');
  // Strip common report-title suffixes
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
  for (const re of suffixes) {
    name = name.replace(re, '');
  }
  return name.trim() || raw.trim();
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    console.log(`[upload] Parsing ${file.name} (${(file.size / 1024).toFixed(0)}KB)...`);
    const buffer = await file.arrayBuffer();
    const data = parseLuminateWorkbook(buffer, file.name);
    console.log(`[upload] Parsed: artistWeekly=${data.artistWeekly?.length || 0}, releaseGroupWeekly=${data.releaseGroupWeekly?.length || 0}, songWeekly=${data.songWeekly?.length || 0}, catalog=${data.catalog?.length || 0}`);
    if (data.artistWeekly?.length) {
      const sample = data.artistWeekly[0];
      console.log(`[upload] Sample weekly: week=${sample.week}, year=${sample.year}, qty=${sample.quantity}, dateRange="${sample.dateRange}"`);
    } else {
      console.log(`[upload] ⚠️ NO artist weekly data parsed from file!`);
    }

    // 1. Create Report
    const report = await prisma.report.create({
      data: {
        fileName: (data.summary?.reportName || 'Upload') + '.xlsx',
        reportName: data.summary?.reportName || 'Unknown Report',
        timeFrame: data.summary?.timeFrame || '',
        location: data.summary?.location || 'Worldwide',
      },
    });

    // 2. Find artist info from parsed data
    const artistItem = data.catalog?.find((c) => c.type === 'Artist');
    const rawName = artistItem?.name || data.artistWeekly?.[0]?.artist || data.summary?.reportName || 'Unknown Artist';
    const artistName = normalizeArtistName(rawName);
    const artistLuminateId = artistItem?.luminateId || data.artistWeekly?.[0]?.luminateId || null;
    const artistGenre = artistItem?.mainGenre || '';

    console.log(`[upload] Artist name: "${rawName}" → normalized: "${artistName}"`);

    // 3. Global dedup: case-insensitive name match, then luminateId
    let artist = await prisma.artist.findFirst({
      where: { name: { equals: artistName, mode: 'insensitive' } },
    });
    if (!artist && artistLuminateId) {
      artist = await prisma.artist.findFirst({ where: { luminateId: artistLuminateId } });
    }

    if (artist) {
      console.log(`[upload] Found existing artist: ${artist.name} (${artist.id})`);
      const updateData: any = {
        genre: artistGenre || artist.genre,
        reportId: report.id,
        luminateUploadedAt: new Date(),
      };
      // Only set luminateId if not already set (avoid unique conflicts)
      if (!artist.luminateId && artistLuminateId) {
        updateData.luminateId = artistLuminateId;
      }
      artist = await prisma.artist.update({ where: { id: artist.id }, data: updateData });
    } else {
      console.log(`[upload] Creating new artist: ${artistName}`);
      artist = await prisma.artist.create({
        data: {
          name: artistName,
          luminateId: artistLuminateId,
          genre: artistGenre,
          reportId: report.id,
          userId,
          luminateUploadedAt: new Date(),
        },
      });
    }

    // 4. Determine location from data
    const location = data.artistWeekly?.[0]?.location || data.summary?.location || 'Worldwide';
    const isTrends = !data.songWeekly?.length && !data.releaseGroupWeekly?.length && data.artistWeekly?.length > 0;
    const fileType = isTrends ? 'luminate-trends' : 'luminate-qbr';

    // 5. Artist Weekly — upsert: update if same (artist, location, week, year) exists, create if not
    //    This prevents double-counting while preserving data from other report time ranges
    if (data.artistWeekly?.length) {
      let upserted = 0;
      for (const row of data.artistWeekly) {
        const week = Math.round(row.week);
        const year = Math.round(row.year);
        const quantity = Math.round(row.quantity);
        await prisma.artistWeekly.upsert({
          where: {
            artistId_location_week_year: { artistId: artist.id, location, week, year },
          },
          update: {
            dateRange: row.dateRange || '',
            quantity,
            ytd: row.ytd != null ? Math.round(row.ytd) : null,
            atd: row.atd != null ? Math.round(row.atd) : null,
          },
          create: {
            artistId: artist.id,
            location,
            week,
            year,
            dateRange: row.dateRange || '',
            quantity,
            ytd: row.ytd != null ? Math.round(row.ytd) : null,
            atd: row.atd != null ? Math.round(row.atd) : null,
          },
        });
        upserted++;
      }
      console.log(`[upload] Artist weekly (${location}): ${upserted} rows upserted`);
    }

    // 6. Track upload
    const totalStreams = data.artistWeekly?.reduce((s, r) => s + r.quantity, 0) || 0;
    await prisma.artistUpload.create({
      data: {
        artistId: artist.id,
        fileName: file.name,
        fileType,
        location,
        weekCount: data.artistWeekly?.length || 0,
        songCount: data.songWeekly?.length ? new Set(data.songWeekly.map(s => s.luminateId)).size : 0,
        totalStreams: BigInt(totalStreams),
      },
    });

    // 5. Release Groups
    const releaseMap = new Map<string, string>();
    for (const cr of (data.catalog || []).filter((c) => c.type === 'Release Group')) {
      try {
        const rg = await prisma.releaseGroup.upsert({
          where: { luminateId: cr.luminateId },
          create: { luminateId: cr.luminateId, artistId: artist.id, title: cr.name, releaseType: cr.releaseType || 'Single', releaseDate: cr.releaseDate },
          update: { title: cr.name, releaseType: cr.releaseType || 'Single', releaseDate: cr.releaseDate, artistId: artist.id },
        });
        releaseMap.set(cr.luminateId, rg.id);
      } catch { /* skip */ }
    }

    if (data.releaseGroupWeekly?.length) {
      const uniqueRGs = new Map<string, { luminateId: string; title: string; releaseType: string }>();
      for (const row of data.releaseGroupWeekly) {
        if (!releaseMap.has(row.luminateId)) {
          uniqueRGs.set(row.luminateId, { luminateId: row.luminateId, title: row.title, releaseType: row.releaseType || 'Single' });
        }
      }
      for (const rg of uniqueRGs.values()) {
        try {
          const created = await prisma.releaseGroup.upsert({
            where: { luminateId: rg.luminateId },
            create: { luminateId: rg.luminateId, artistId: artist.id, title: rg.title, releaseType: rg.releaseType },
            update: { title: rg.title, artistId: artist.id },
          });
          releaseMap.set(rg.luminateId, created.id);
        } catch { /* skip */ }
      }

      const rgIds = Array.from(new Set(releaseMap.values()));
      if (rgIds.length > 0) {
        await prisma.releaseGroupWeekly.deleteMany({ where: { releaseGroupId: { in: rgIds } } });
      }

      const rgWeeklyData = data.releaseGroupWeekly
        .filter((row) => releaseMap.has(row.luminateId))
        .map((row) => ({
          releaseGroupId: releaseMap.get(row.luminateId)!,
          week: Math.round(row.week),
          year: Math.round(row.year),
          dateRange: row.dateRange || '',
          quantity: Math.round(row.quantity),
          ytd: row.ytd != null ? Math.round(row.ytd) : null,
          atd: row.atd != null ? Math.round(row.atd) : null,
        }));

      if (rgWeeklyData.length > 0) {
        const result = await prisma.releaseGroupWeekly.createMany({ data: rgWeeklyData, skipDuplicates: true });
        console.log(`[upload] Release weekly: ${result.count} rows`);
      }
    }

    // 6. Songs
    const songMap = new Map<string, string>();
    for (const cs of (data.catalog || []).filter((c) => c.type === 'Song')) {
      try {
        const song = await prisma.song.upsert({
          where: { luminateId: cs.luminateId },
          create: { luminateId: cs.luminateId, artistId: artist.id, title: cs.name },
          update: { title: cs.name, artistId: artist.id },
        });
        songMap.set(cs.luminateId, song.id);
      } catch { /* skip */ }
    }

    if (data.songWeekly?.length) {
      const uniqueSongs = new Map<string, { luminateId: string; title: string }>();
      for (const row of data.songWeekly) {
        if (!songMap.has(row.luminateId)) {
          uniqueSongs.set(row.luminateId, { luminateId: row.luminateId, title: row.title });
        }
      }
      for (const s of uniqueSongs.values()) {
        try {
          const created = await prisma.song.upsert({
            where: { luminateId: s.luminateId },
            create: { luminateId: s.luminateId, artistId: artist.id, title: s.title },
            update: { title: s.title, artistId: artist.id },
          });
          songMap.set(s.luminateId, created.id);
        } catch { /* skip */ }
      }

      const songIds = Array.from(new Set(songMap.values()));
      if (songIds.length > 0) {
        await prisma.songWeekly.deleteMany({ where: { songId: { in: songIds } } });
      }

      const songWeeklyData = data.songWeekly
        .filter((row) => songMap.has(row.luminateId))
        .map((row) => ({
          songId: songMap.get(row.luminateId)!,
          week: Math.round(row.week),
          year: Math.round(row.year),
          dateRange: row.dateRange || '',
          quantity: Math.round(row.quantity),
          ytd: row.ytd != null ? Math.round(row.ytd) : null,
          atd: row.atd != null ? Math.round(row.atd) : null,
        }));

      if (songWeeklyData.length > 0) {
        for (let i = 0; i < songWeeklyData.length; i += 5000) {
          const result = await prisma.songWeekly.createMany({
            data: songWeeklyData.slice(i, i + 5000),
            skipDuplicates: true,
          });
          console.log(`[upload] Song weekly batch ${Math.floor(i/5000)+1}: ${result.count} rows`);
        }
      }
    }

    console.log(`[upload] ✅ Complete: ${artist.name} (${artist.id})`);

    // 8. Auto-merge: find any other artists with the same normalized name and merge into this one
    const allWithName = await prisma.artist.findMany({
      where: {
        id: { not: artist.id },
      },
    });
    const myNormalized = normalizeArtistName(artist.name).toLowerCase();
    const duplicates = allWithName.filter(
      (a) => normalizeArtistName(a.name).toLowerCase() === myNormalized
    );

    if (duplicates.length > 0) {
      console.log(`[upload] Found ${duplicates.length} duplicate(s) for "${artist.name}", merging...`);
      for (const dupe of duplicates) {
        // Move weekly data (skip constraint violations)
        try {
          const dupeWeekly = await prisma.artistWeekly.findMany({ where: { artistId: dupe.id } });
          for (const w of dupeWeekly) {
            try {
              await prisma.artistWeekly.upsert({
                where: { artistId_location_week_year: { artistId: artist.id, location: w.location, week: w.week, year: w.year } },
                update: { quantity: w.quantity, ytd: w.ytd, atd: w.atd, dateRange: w.dateRange },
                create: { artistId: artist.id, location: w.location, week: w.week, year: w.year, dateRange: w.dateRange, quantity: w.quantity, ytd: w.ytd, atd: w.atd },
              });
            } catch { /* skip */ }
          }
          await prisma.artistWeekly.deleteMany({ where: { artistId: dupe.id } });
        } catch { /* skip */ }

        // Move songs
        try {
          const dupeSongs = await prisma.song.findMany({ where: { artistId: dupe.id } });
          for (const s of dupeSongs) {
            const exists = await prisma.song.findFirst({ where: { luminateId: s.luminateId, artistId: artist.id } });
            if (!exists) {
              try { await prisma.song.update({ where: { id: s.id }, data: { artistId: artist.id } }); } catch { /* skip */ }
            }
          }
          await prisma.songWeekly.deleteMany({ where: { song: { artistId: dupe.id } } });
          await prisma.song.deleteMany({ where: { artistId: dupe.id } });
        } catch { /* skip */ }

        // Move releases
        try {
          const dupeRGs = await prisma.releaseGroup.findMany({ where: { artistId: dupe.id } });
          for (const rg of dupeRGs) {
            const exists = await prisma.releaseGroup.findFirst({ where: { luminateId: rg.luminateId, artistId: artist.id } });
            if (!exists) {
              try { await prisma.releaseGroup.update({ where: { id: rg.id }, data: { artistId: artist.id } }); } catch { /* skip */ }
            }
          }
          await prisma.releaseGroupWeekly.deleteMany({ where: { releaseGroup: { artistId: dupe.id } } });
          await prisma.releaseGroup.deleteMany({ where: { artistId: dupe.id } });
        } catch { /* skip */ }

        // Move uploads, distrokid, etc
        try { await prisma.artistUpload.updateMany({ where: { artistId: dupe.id }, data: { artistId: artist.id } }); } catch { /* skip */ }
        try { await prisma.distroKidMonthly.updateMany({ where: { artistId: dupe.id }, data: { artistId: artist.id } }); } catch { /* skip */ }
        try { await prisma.pinnedMetric.updateMany({ where: { artistId: dupe.id }, data: { artistId: artist.id } }); } catch { /* skip */ }

        // Delete duplicate
        await prisma.artist.delete({ where: { id: dupe.id } });
        console.log(`[upload] Merged & deleted duplicate: "${dupe.name}" (${dupe.id})`);
      }
    }

    return NextResponse.json({
      success: true,
      artistId: artist.id,
      artistName: artist.name,
      merged: duplicates.length,
      stats: {
        weeklyRows: data.artistWeekly?.length || 0,
        releases: releaseMap.size,
        songs: songMap.size,
        songWeeklyRows: data.songWeekly?.length || 0,
      },
    });
  } catch (error) {
    console.error('[upload] ❌ FAILED:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
