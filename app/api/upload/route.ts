import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';
import { parseLuminateWorkbook } from '@/lib/parser';

export const maxDuration = 60;

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

    const buffer = await file.arrayBuffer();
    const data = parseLuminateWorkbook(buffer);

    // 1. Create Report
    const report = await prisma.report.create({
      data: {
        fileName: (data.summary?.reportName || 'Upload') + '.xlsx',
        reportName: data.summary?.reportName || 'Unknown Report',
        timeFrame: data.summary?.timeFrame || '',
        location: data.summary?.location || 'Worldwide',
      },
    });

    // 2. Find artist
    const artistItem = data.catalog?.find((c) => c.type === 'Artist');
    const artistName = artistItem?.name || data.artistWeekly?.[0]?.artist || data.summary?.reportName || 'Unknown Artist';
    const artistLuminateId = artistItem?.luminateId || data.artistWeekly?.[0]?.luminateId || null;
    const artistGenre = artistItem?.mainGenre || '';

    // 3. Upsert Artist
    let artist;
    if (artistLuminateId) {
      const existing = await prisma.artist.findUnique({ where: { luminateId: artistLuminateId } });
      if (existing) {
        artist = await prisma.artist.update({
          where: { luminateId: artistLuminateId },
          data: { name: artistName, genre: artistGenre, reportId: report.id, luminateUploadedAt: new Date() },
        });
      } else {
        artist = await prisma.artist.create({
          data: { luminateId: artistLuminateId, name: artistName, genre: artistGenre, reportId: report.id, userId, luminateUploadedAt: new Date() },
        });
      }
    } else {
      const existing = await prisma.artist.findFirst({ where: { name: artistName, userId } });
      if (existing) {
        artist = await prisma.artist.update({
          where: { id: existing.id },
          data: { genre: artistGenre || existing.genre, reportId: report.id, luminateUploadedAt: new Date() },
        });
      } else {
        artist = await prisma.artist.create({
          data: { name: artistName, genre: artistGenre, reportId: report.id, userId, luminateUploadedAt: new Date() },
        });
      }
    }

    // 4. Artist Weekly — delete old + bulk insert (much faster than 100 upserts)
    if (data.artistWeekly?.length) {
      await prisma.artistWeekly.deleteMany({ where: { artistId: artist.id } });
      await prisma.artistWeekly.createMany({
        data: data.artistWeekly.map((row) => ({
          artistId: artist.id,
          week: Math.round(row.week),
          year: Math.round(row.year),
          dateRange: row.dateRange || '',
          quantity: Math.round(row.quantity),
          ytd: row.ytd != null ? Math.round(row.ytd) : null,
          atd: row.atd != null ? Math.round(row.atd) : null,
        })),
        skipDuplicates: true,
      });
    }

    // 5. Release Groups — upsert catalog entries, then bulk insert weekly data
    const releaseMap = new Map<string, string>();
    for (const cr of (data.catalog || []).filter((c) => c.type === 'Release Group')) {
      try {
        const rg = await prisma.releaseGroup.upsert({
          where: { luminateId: cr.luminateId },
          create: { luminateId: cr.luminateId, artistId: artist.id, title: cr.name, releaseType: cr.releaseType || 'Single', releaseDate: cr.releaseDate },
          update: { title: cr.name, releaseType: cr.releaseType || 'Single', releaseDate: cr.releaseDate },
        });
        releaseMap.set(cr.luminateId, rg.id);
      } catch { /* skip */ }
    }

    // Ensure all release groups from weekly data exist
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
            update: { title: rg.title },
          });
          releaseMap.set(rg.luminateId, created.id);
        } catch { /* skip */ }
      }

      // Delete old weekly data and bulk insert
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
        await prisma.releaseGroupWeekly.createMany({ data: rgWeeklyData, skipDuplicates: true });
      }
    }

    // 6. Songs — upsert catalog entries, then bulk insert weekly data
    const songMap = new Map<string, string>();
    for (const cs of (data.catalog || []).filter((c) => c.type === 'Song')) {
      try {
        const song = await prisma.song.upsert({
          where: { luminateId: cs.luminateId },
          create: { luminateId: cs.luminateId, artistId: artist.id, title: cs.name },
          update: { title: cs.name },
        });
        songMap.set(cs.luminateId, song.id);
      } catch { /* skip */ }
    }

    // Ensure all songs from weekly data exist
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
            update: { title: s.title },
          });
          songMap.set(s.luminateId, created.id);
        } catch { /* skip */ }
      }

      // Delete old weekly data and bulk insert
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
        // Batch in chunks of 5000 for Prisma limits
        for (let i = 0; i < songWeeklyData.length; i += 5000) {
          await prisma.songWeekly.createMany({
            data: songWeeklyData.slice(i, i + 5000),
            skipDuplicates: true,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      artistId: artist.id,
      artistName: artist.name,
      stats: {
        weeklyRows: data.artistWeekly?.length || 0,
        releases: releaseMap.size,
        songs: songMap.size,
        songWeeklyRows: data.songWeekly?.length || 0,
      },
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
