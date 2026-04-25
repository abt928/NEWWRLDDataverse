import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Verify artist exists
    const artist = await prisma.artist.findUnique({ where: { id } });
    if (!artist) {
      return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
    }

    // Delete all related data (cascade)
    // Song weekly -> Songs
    const songs = await prisma.song.findMany({ where: { artistId: id }, select: { id: true } });
    if (songs.length > 0) {
      await prisma.songWeekly.deleteMany({ where: { songId: { in: songs.map(s => s.id) } } });
      await prisma.song.deleteMany({ where: { artistId: id } });
    }

    // Release group weekly -> Release groups
    const releases = await prisma.releaseGroup.findMany({ where: { artistId: id }, select: { id: true } });
    if (releases.length > 0) {
      await prisma.releaseGroupWeekly.deleteMany({ where: { releaseGroupId: { in: releases.map(r => r.id) } } });
      await prisma.releaseGroup.deleteMany({ where: { artistId: id } });
    }

    // Artist weekly
    await prisma.artistWeekly.deleteMany({ where: { artistId: id } });

    // DistroKid data
    await prisma.distroKidMonthly.deleteMany({ where: { artistId: id } });

    // Share links
    await prisma.shareLink.deleteMany({ where: { artistId: id } });

    // Finally delete the artist
    await prisma.artist.delete({ where: { id } });

    console.log(`[delete] Deleted artist: ${artist.name} (${id})`);

    return NextResponse.json({ success: true, name: artist.name });
  } catch (error) {
    console.error('Delete artist error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Delete failed' },
      { status: 500 }
    );
  }
}
