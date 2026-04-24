import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import type { LuminateDataset, CatalogItem, ArtistWeekly, ReleaseGroupWeekly, SongWeekly } from '@/lib/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const artist = await prisma.artist.findUnique({
      where: { id },
      include: {
        report: true,
        weekly: { orderBy: [{ year: 'asc' }, { week: 'asc' }] },
        releases: {
          include: {
            weekly: { orderBy: [{ year: 'asc' }, { week: 'asc' }] },
          },
        },
        songs: {
          include: {
            weekly: { orderBy: [{ year: 'asc' }, { week: 'asc' }] },
          },
        },
      },
    });

    if (!artist) {
      return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
    }

    // Reconstruct LuminateDataset from DB data for the existing analytics engine
    const catalog: CatalogItem[] = [
      {
        type: 'Artist',
        name: artist.name,
        artist: '-',
        releaseType: '-',
        releaseDate: null,
        mainGenre: artist.genre,
        luminateId: artist.luminateId || '',
      },
      ...artist.releases.map((r: any) => ({
        type: 'Release Group' as const,
        name: r.title,
        artist: artist.name,
        releaseType: r.releaseType,
        releaseDate: r.releaseDate,
        mainGenre: '',
        luminateId: r.luminateId,
      })),
      ...artist.songs.map((s: any) => ({
        type: 'Song' as const,
        name: s.title,
        artist: artist.name,
        releaseType: '',
        releaseDate: null,
        mainGenre: '',
        luminateId: s.luminateId || '',
      })),
    ];

    const artistWeekly: ArtistWeekly[] = artist.weekly.map((w: any) => ({
      location: 'Worldwide',
      entity: 'Artist',
      artist: artist.name,
      luminateId: artist.luminateId || '',
      activity: 'Streams',
      week: w.week,
      year: w.year,
      dateRange: w.dateRange,
      quantity: w.quantity,
      ytd: w.ytd,
      atd: w.atd,
    }));

    const releaseGroupWeekly: ReleaseGroupWeekly[] = artist.releases.flatMap((r: any) =>
      r.weekly.map((w: any) => ({
        location: 'Worldwide',
        entity: 'Release Group',
        artist: artist.name,
        title: r.title,
        luminateId: r.luminateId,
        activity: 'Streams',
        releaseType: r.releaseType,
        week: w.week,
        year: w.year,
        dateRange: w.dateRange,
        quantity: w.quantity,
        ytd: w.ytd,
        atd: w.atd,
      }))
    );

    const songWeekly: SongWeekly[] = artist.songs.flatMap((s: any) =>
      s.weekly.map((w: any) => ({
        location: 'Worldwide',
        entity: 'Song',
        artist: artist.name,
        title: s.title,
        luminateId: s.luminateId,
        activity: 'Streams',
        week: w.week,
        year: w.year,
        dateRange: w.dateRange,
        quantity: w.quantity,
        ytd: w.ytd,
        atd: w.atd,
      }))
    );

    const dataset: LuminateDataset = {
      summary: {
        reportName: artist.name,
        reportGenerated: '',
        reportId: artist.report?.id || '',
        timeFrame: artist.report?.timeFrame || '',
        location: artist.report?.location || 'Worldwide',
        market: 'National',
        includedActivities: ['Streams'],
      },
      catalog,
      artistWeekly,
      releaseGroupWeekly,
      songWeekly,
    };

    return NextResponse.json(dataset);
  } catch (error) {
    console.error('Artist detail error:', error);
    return NextResponse.json({ error: 'Failed to load artist' }, { status: 500 });
  }
}
