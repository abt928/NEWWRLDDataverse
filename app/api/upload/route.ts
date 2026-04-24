import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';
import type { LuminateDataset } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const data: LuminateDataset = await req.json();

    // 1. Upsert Report
    const report = await prisma.report.create({
      data: {
        fileName: data.summary.reportName + '.xlsx',
        reportName: data.summary.reportName,
        timeFrame: data.summary.timeFrame,
        location: data.summary.location || 'Worldwide',
      },
    });

    // 2. Find artist entity from catalog
    const artistItem = data.catalog.find((c) => c.type === 'Artist');
    if (!artistItem) {
      return NextResponse.json({ error: 'No artist found in catalog' }, { status: 400 });
    }

    // 3. Upsert Artist (now tied to user)
    const existingArtist = await prisma.artist.findUnique({
      where: { luminateId: artistItem.luminateId },
    });

    let artist;
    if (existingArtist) {
      artist = await prisma.artist.update({
        where: { luminateId: artistItem.luminateId },
        data: {
          name: artistItem.name,
          genre: artistItem.mainGenre || '',
          reportId: report.id,
          luminateUploadedAt: new Date(),
        },
      });
    } else {
      artist = await prisma.artist.create({
        data: {
          luminateId: artistItem.luminateId,
          name: artistItem.name,
          genre: artistItem.mainGenre || '',
          reportId: report.id,
          userId,
          luminateUploadedAt: new Date(),
        },
      });
    }

    // 4. Upsert Artist Weekly data (dedup by week+year)
    for (const row of data.artistWeekly) {
      await prisma.artistWeekly.upsert({
        where: {
          artistId_week_year: {
            artistId: artist.id,
            week: Math.round(row.week),
            year: Math.round(row.year),
          },
        },
        create: {
          artistId: artist.id,
          week: Math.round(row.week),
          year: Math.round(row.year),
          dateRange: row.dateRange,
          quantity: Math.round(row.quantity),
          ytd: row.ytd != null ? Math.round(row.ytd) : null,
          atd: row.atd != null ? Math.round(row.atd) : null,
        },
        update: {
          quantity: Math.round(row.quantity),
          ytd: row.ytd != null ? Math.round(row.ytd) : null,
          atd: row.atd != null ? Math.round(row.atd) : null,
          dateRange: row.dateRange,
        },
      });
    }

    // 5. Upsert Release Groups + weekly data
    const releaseMap = new Map<string, string>();
    const catalogReleases = data.catalog.filter((c) => c.type === 'Release Group');

    for (const cr of catalogReleases) {
      const rg = await prisma.releaseGroup.upsert({
        where: { luminateId: cr.luminateId },
        create: {
          luminateId: cr.luminateId,
          artistId: artist.id,
          title: cr.name,
          releaseType: cr.releaseType || 'Single',
          releaseDate: cr.releaseDate,
        },
        update: {
          title: cr.name,
          releaseType: cr.releaseType || 'Single',
          releaseDate: cr.releaseDate,
        },
      });
      releaseMap.set(cr.luminateId, rg.id);
    }

    for (const row of data.releaseGroupWeekly) {
      let rgId: string | undefined = releaseMap.get(row.luminateId);
      if (!rgId) {
        const rg = await prisma.releaseGroup.upsert({
          where: { luminateId: row.luminateId },
          create: {
            luminateId: row.luminateId,
            artistId: artist.id,
            title: row.title,
            releaseType: row.releaseType || 'Single',
          },
          update: { title: row.title },
        });
        rgId = rg.id;
        releaseMap.set(row.luminateId, rgId!);
      }
      await prisma.releaseGroupWeekly.upsert({
        where: {
          releaseGroupId_week_year: {
            releaseGroupId: rgId!,
            week: Math.round(row.week),
            year: Math.round(row.year),
          },
        },
        create: {
          releaseGroupId: rgId!,
          week: Math.round(row.week),
          year: Math.round(row.year),
          dateRange: row.dateRange,
          quantity: Math.round(row.quantity),
          ytd: row.ytd != null ? Math.round(row.ytd) : null,
          atd: row.atd != null ? Math.round(row.atd) : null,
        },
        update: {
          quantity: Math.round(row.quantity),
          ytd: row.ytd != null ? Math.round(row.ytd) : null,
          atd: row.atd != null ? Math.round(row.atd) : null,
        },
      });
    }

    // 6. Upsert Songs + weekly data
    const songMap = new Map<string, string>();
    const catalogSongs = data.catalog.filter((c) => c.type === 'Song');

    for (const cs of catalogSongs) {
      const song = await prisma.song.upsert({
        where: { luminateId: cs.luminateId },
        create: {
          luminateId: cs.luminateId,
          artistId: artist.id,
          title: cs.name,
        },
        update: { title: cs.name },
      });
      songMap.set(cs.luminateId, song.id);
    }

    for (const row of data.songWeekly) {
      let songId: string | undefined = songMap.get(row.luminateId);
      if (!songId) {
        const song = await prisma.song.upsert({
          where: { luminateId: row.luminateId },
          create: {
            luminateId: row.luminateId,
            artistId: artist.id,
            title: row.title,
          },
          update: { title: row.title },
        });
        songId = song.id;
        songMap.set(row.luminateId, songId!);
      }
      await prisma.songWeekly.upsert({
        where: {
          songId_week_year: {
            songId,
            week: Math.round(row.week),
            year: Math.round(row.year),
          },
        },
        create: {
          songId,
          week: Math.round(row.week),
          year: Math.round(row.year),
          dateRange: row.dateRange,
          quantity: Math.round(row.quantity),
          ytd: row.ytd != null ? Math.round(row.ytd) : null,
          atd: row.atd != null ? Math.round(row.atd) : null,
        },
        update: {
          quantity: Math.round(row.quantity),
          ytd: row.ytd != null ? Math.round(row.ytd) : null,
          atd: row.atd != null ? Math.round(row.atd) : null,
        },
      });
    }

    return NextResponse.json({
      success: true,
      artistId: artist.id,
      artistName: artist.name,
      reportId: report.id,
      stats: {
        weeklyRows: data.artistWeekly.length,
        releases: releaseMap.size,
        songs: songMap.size,
        songWeeklyRows: data.songWeekly.length,
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
