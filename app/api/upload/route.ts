import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';
import { parseLuminateWorkbook } from '@/lib/parser';
import { parseDistroKidZip } from '@/lib/distrokid-parser';

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
    const fileType = formData.get('type') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();

    if (fileType === 'distrokid') {
      return handleDistroKid(buffer, userId);
    } else {
      return handleLuminate(buffer, userId);
    }
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}

// ============================================================
// Luminate Upload Handler
// ============================================================

async function handleLuminate(buffer: ArrayBuffer, userId: string) {
  const data = parseLuminateWorkbook(buffer);

  // Create Report
  const report = await prisma.report.create({
    data: {
      fileName: (data.summary?.reportName || 'Upload') + '.xlsx',
      reportName: data.summary?.reportName || 'Unknown Report',
      timeFrame: data.summary?.timeFrame || '',
      location: data.summary?.location || 'Worldwide',
    },
  });

  // Find artist — try catalog first, fall back to artistWeekly data
  const artistItem = data.catalog?.find((c) => c.type === 'Artist');
  const artistName = artistItem?.name
    || data.artistWeekly?.[0]?.artist
    || data.summary?.reportName
    || 'Unknown Artist';
  const artistLuminateId = artistItem?.luminateId
    || data.artistWeekly?.[0]?.luminateId
    || null;
  const artistGenre = artistItem?.mainGenre || '';

  // Upsert Artist
  let artist;
  if (artistLuminateId) {
    const existing = await prisma.artist.findUnique({
      where: { luminateId: artistLuminateId },
    });
    if (existing) {
      artist = await prisma.artist.update({
        where: { luminateId: artistLuminateId },
        data: {
          name: artistName,
          genre: artistGenre,
          reportId: report.id,
          luminateUploadedAt: new Date(),
        },
      });
    } else {
      artist = await prisma.artist.create({
        data: {
          luminateId: artistLuminateId,
          name: artistName,
          genre: artistGenre,
          reportId: report.id,
          userId,
          luminateUploadedAt: new Date(),
        },
      });
    }
  } else {
    const existing = await prisma.artist.findFirst({
      where: { name: artistName, userId },
    });
    if (existing) {
      artist = await prisma.artist.update({
        where: { id: existing.id },
        data: {
          genre: artistGenre || existing.genre,
          reportId: report.id,
          luminateUploadedAt: new Date(),
        },
      });
    } else {
      artist = await prisma.artist.create({
        data: {
          name: artistName,
          genre: artistGenre,
          reportId: report.id,
          userId,
          luminateUploadedAt: new Date(),
        },
      });
    }
  }

  // Batch upsert weekly data
  let weeklyCount = 0;
  for (const row of (data.artistWeekly || [])) {
    try {
      await prisma.artistWeekly.upsert({
        where: { artistId_week_year: { artistId: artist.id, week: Math.round(row.week), year: Math.round(row.year) } },
        create: { artistId: artist.id, week: Math.round(row.week), year: Math.round(row.year), dateRange: row.dateRange || '', quantity: Math.round(row.quantity), ytd: row.ytd != null ? Math.round(row.ytd) : null, atd: row.atd != null ? Math.round(row.atd) : null },
        update: { quantity: Math.round(row.quantity), ytd: row.ytd != null ? Math.round(row.ytd) : null, atd: row.atd != null ? Math.round(row.atd) : null, dateRange: row.dateRange || '' },
      });
      weeklyCount++;
    } catch { /* skip row */ }
  }

  // Upsert Release Groups
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

  for (const row of (data.releaseGroupWeekly || [])) {
    try {
      let rgId = releaseMap.get(row.luminateId);
      if (!rgId) {
        const rg = await prisma.releaseGroup.upsert({
          where: { luminateId: row.luminateId },
          create: { luminateId: row.luminateId, artistId: artist.id, title: row.title, releaseType: row.releaseType || 'Single' },
          update: { title: row.title },
        });
        rgId = rg.id;
        releaseMap.set(row.luminateId, rgId);
      }
      await prisma.releaseGroupWeekly.upsert({
        where: { releaseGroupId_week_year: { releaseGroupId: rgId, week: Math.round(row.week), year: Math.round(row.year) } },
        create: { releaseGroupId: rgId, week: Math.round(row.week), year: Math.round(row.year), dateRange: row.dateRange || '', quantity: Math.round(row.quantity), ytd: row.ytd != null ? Math.round(row.ytd) : null, atd: row.atd != null ? Math.round(row.atd) : null },
        update: { quantity: Math.round(row.quantity), ytd: row.ytd != null ? Math.round(row.ytd) : null, atd: row.atd != null ? Math.round(row.atd) : null },
      });
    } catch { /* skip row */ }
  }

  // Upsert Songs
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

  for (const row of (data.songWeekly || [])) {
    try {
      let songId = songMap.get(row.luminateId);
      if (!songId) {
        const song = await prisma.song.upsert({
          where: { luminateId: row.luminateId },
          create: { luminateId: row.luminateId, artistId: artist.id, title: row.title },
          update: { title: row.title },
        });
        songId = song.id;
        songMap.set(row.luminateId, songId);
      }
      await prisma.songWeekly.upsert({
        where: { songId_week_year: { songId, week: Math.round(row.week), year: Math.round(row.year) } },
        create: { songId, week: Math.round(row.week), year: Math.round(row.year), dateRange: row.dateRange || '', quantity: Math.round(row.quantity), ytd: row.ytd != null ? Math.round(row.ytd) : null, atd: row.atd != null ? Math.round(row.atd) : null },
        update: { quantity: Math.round(row.quantity), ytd: row.ytd != null ? Math.round(row.ytd) : null, atd: row.atd != null ? Math.round(row.atd) : null },
      });
    } catch { /* skip row */ }
  }

  return NextResponse.json({
    success: true,
    artistId: artist.id,
    artistName: artist.name,
    stats: { weeklyRows: weeklyCount, releases: releaseMap.size, songs: songMap.size },
  });
}

// ============================================================
// DistroKid Upload Handler
// ============================================================

async function handleDistroKid(buffer: ArrayBuffer, userId: string) {
  const data = await parseDistroKidZip(buffer);

  // Find or create artist
  let artist = await prisma.artist.findFirst({
    where: { userId, name: data.artistName },
  });

  if (!artist) {
    artist = await prisma.artist.create({
      data: { name: data.artistName, userId, distrokidUploadedAt: new Date() },
    });
  } else {
    artist = await prisma.artist.update({
      where: { id: artist.id },
      data: { distrokidUploadedAt: new Date() },
    });
  }

  // Batch upsert entries
  let upserted = 0;
  for (const entry of (data.rawEntries || [])) {
    try {
      await prisma.distroKidMonthly.upsert({
        where: {
          artistId_saleMonth_store_title_isrc_country: {
            artistId: artist.id,
            saleMonth: entry.saleMonth || '',
            store: entry.store || '',
            title: entry.title || '',
            isrc: entry.isrc || '',
            country: entry.country || '',
          },
        },
        create: {
          artistId: artist.id,
          saleMonth: entry.saleMonth || '',
          store: entry.store || '',
          title: entry.title || '',
          isrc: entry.isrc || '',
          country: entry.country || '',
          quantity: entry.quantity,
          earnings: entry.earnings,
        },
        update: { quantity: entry.quantity, earnings: entry.earnings },
      });
      upserted++;
    } catch { /* skip row */ }
  }

  return NextResponse.json({
    success: true,
    artistId: artist.id,
    artistName: artist.name,
    rowsProcessed: upserted,
  });
}
