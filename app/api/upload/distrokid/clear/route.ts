import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

// Temporary endpoint to clear DK data for re-upload with teamPercentage
export async function POST(req: NextRequest) {
  try {
    const { artistName } = await req.json();
    if (!artistName) {
      return NextResponse.json({ error: 'artistName required' }, { status: 400 });
    }

    // Find artist by name (case-insensitive partial match)
    const artists = await prisma.artist.findMany({
      where: { name: { contains: artistName, mode: 'insensitive' } },
    });

    if (artists.length === 0) {
      return NextResponse.json({ error: `No artist found matching "${artistName}"` }, { status: 404 });
    }

    let totalDeleted = 0;
    for (const artist of artists) {
      const deleted = await prisma.distroKidMonthly.deleteMany({
        where: { artistId: artist.id },
      });
      totalDeleted += deleted.count;
      console.log(`[dk-clear] Deleted ${deleted.count} DK rows for "${artist.name}" (${artist.id})`);
    }

    return NextResponse.json({
      success: true,
      totalDeleted,
      artists: artists.map(a => ({ id: a.id, name: a.name })),
    });
  } catch (error) {
    console.error('[dk-clear] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
