import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET() {
  try {
    const artists = await prisma.artist.findMany({
      include: {
        weekly: {
          orderBy: [{ year: 'desc' }, { week: 'desc' }],
          take: 12,
        },
        _count: {
          select: { songs: true, releases: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const result = artists.map((artist: any) => {
      const sorted = [...artist.weekly].sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return a.week - b.week;
      });
      const mostRecent = sorted[sorted.length - 1];
      const prior = sorted[sorted.length - 2];

      const atd = mostRecent?.atd ?? sorted.reduce((s, w) => s + w.quantity, 0);
      const ytd = mostRecent?.ytd ?? 0;
      const currentWeek = mostRecent?.quantity ?? 0;
      const wowChange = prior && prior.quantity > 0
        ? ((currentWeek - prior.quantity) / prior.quantity) * 100
        : 0;

      // Trailing avg
      const avg12 = sorted.length > 0
        ? sorted.reduce((s, w) => s + w.quantity, 0) / sorted.length
        : 0;

      // Sparkline (last 12 weeks)
      const sparkline = sorted.map((w) => w.quantity);

      return {
        id: artist.id,
        name: artist.name,
        genre: artist.genre,
        luminateId: artist.luminateId,
        atd,
        ytd,
        currentWeek,
        wowChange: Math.round(wowChange * 10) / 10,
        avg12w: Math.round(avg12),
        songCount: artist._count.songs,
        releaseCount: artist._count.releases,
        sparkline,
        lastUpdated: mostRecent?.dateRange ?? '',
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Artists list error:', error);
    return NextResponse.json({ error: 'Failed to load artists' }, { status: 500 });
  }
}
