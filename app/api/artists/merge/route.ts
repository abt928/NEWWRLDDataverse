import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';

/**
 * POST /api/artists/merge
 * Finds duplicate artists (by normalized name, case-insensitive) and merges them:
 * - Picks the artist with the most weekly data as the "winner"
 * - Moves all songs, releases, uploads, distrokid data, weekly data from losers → winner
 * - Deletes the loser artist records
 * - Returns a summary of what was merged
 */

/** Strip CLONE prefixes + common report suffixes to get canonical name */
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
  for (const re of suffixes) {
    name = name.replace(re, '');
  }
  return name.trim() || raw.trim();
}

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allArtists = await prisma.artist.findMany({
      include: {
        _count: {
          select: {
            weekly: true,
            songs: true,
            releases: true,
            distrokidData: true,
            uploads: true,
            manualRevenue: true,
            pinnedMetrics: true,
            shareLinks: true,
          },
        },
      },
    });

    // Group by normalized name (case-insensitive)
    const groups = new Map<string, typeof allArtists>();
    for (const artist of allArtists) {
      const normalized = normalizeArtistName(artist.name).toLowerCase();
      const group = groups.get(normalized) || [];
      group.push(artist);
      groups.set(normalized, group);
    }

    const mergeLog: { name: string; merged: number; winner: string; losers: string[] }[] = [];

    for (const [normalizedName, group] of groups) {
      if (group.length <= 1) continue;

      // Pick winner: most weekly data, then most songs, then most uploads
      group.sort((a, b) => {
        const aScore = a._count.weekly * 100 + a._count.songs * 10 + a._count.uploads;
        const bScore = b._count.weekly * 100 + b._count.songs * 10 + b._count.uploads;
        return bScore - aScore;
      });

      const winner = group[0];
      const losers = group.slice(1);

      // Use the cleanest name (shortest non-CLONE name, or the winner's)
      const cleanName = normalizeArtistName(
        group.map(a => a.name).sort((a, b) => a.length - b.length)[0]
      );

      console.log(`[merge] "${normalizedName}": winner=${winner.name} (${winner.id}), merging ${losers.length} duplicates`);

      for (const loser of losers) {
        // Move weekly data (skip duplicates due to unique constraint)
        try {
          await prisma.$executeRawUnsafe(
            `UPDATE "ArtistWeekly" SET "artistId" = $1 WHERE "artistId" = $2 
             AND NOT EXISTS (
               SELECT 1 FROM "ArtistWeekly" w2 
               WHERE w2."artistId" = $1 AND w2."week" = "ArtistWeekly"."week" 
               AND w2."year" = "ArtistWeekly"."year" AND w2."location" = "ArtistWeekly"."location"
             )`,
            winner.id, loser.id
          );
        } catch { /* constraint violations expected */ }
        // Delete remaining (duplicates that couldn't be moved)
        await prisma.artistWeekly.deleteMany({ where: { artistId: loser.id } });

        // Move songs (skip if luminateId already exists on winner)
        const loserSongs = await prisma.song.findMany({ where: { artistId: loser.id } });
        for (const song of loserSongs) {
          const exists = await prisma.song.findFirst({
            where: { artistId: winner.id, luminateId: song.luminateId },
          });
          if (!exists) {
            try {
              await prisma.song.update({
                where: { id: song.id },
                data: { artistId: winner.id },
              });
            } catch { /* skip */ }
          }
        }
        // Delete remaining songs on loser
        await prisma.songWeekly.deleteMany({
          where: { song: { artistId: loser.id } },
        });
        await prisma.song.deleteMany({ where: { artistId: loser.id } });

        // Move releases
        const loserReleases = await prisma.releaseGroup.findMany({ where: { artistId: loser.id } });
        for (const rg of loserReleases) {
          const exists = await prisma.releaseGroup.findFirst({
            where: { artistId: winner.id, luminateId: rg.luminateId },
          });
          if (!exists) {
            try {
              await prisma.releaseGroup.update({
                where: { id: rg.id },
                data: { artistId: winner.id },
              });
            } catch { /* skip */ }
          }
        }
        await prisma.releaseGroupWeekly.deleteMany({
          where: { releaseGroup: { artistId: loser.id } },
        });
        await prisma.releaseGroup.deleteMany({ where: { artistId: loser.id } });

        // Move distrokid data
        try {
          await prisma.distroKidMonthly.updateMany({
            where: { artistId: loser.id },
            data: { artistId: winner.id },
          });
        } catch { /* skip */ }

        // Move uploads
        await prisma.artistUpload.updateMany({
          where: { artistId: loser.id },
          data: { artistId: winner.id },
        });

        // Move manual revenue (skip dupes)
        try {
          await prisma.manualRevenue.updateMany({
            where: { artistId: loser.id },
            data: { artistId: winner.id },
          });
        } catch { /* skip */ }

        // Move pinned metrics
        await prisma.pinnedMetric.updateMany({
          where: { artistId: loser.id },
          data: { artistId: winner.id },
        });

        // Delete loser
        await prisma.artist.delete({ where: { id: loser.id } });
        console.log(`[merge] Deleted duplicate: "${loser.name}" (${loser.id})`);
      }

      // Rename winner to cleanest name
      if (winner.name !== cleanName) {
        await prisma.artist.update({
          where: { id: winner.id },
          data: { name: cleanName },
        });
        console.log(`[merge] Renamed "${winner.name}" → "${cleanName}"`);
      }

      mergeLog.push({
        name: cleanName,
        merged: losers.length,
        winner: winner.id,
        losers: losers.map(l => `${l.name} (${l.id})`),
      });
    }

    console.log(`[merge] ✅ Complete: ${mergeLog.length} groups merged`);

    return NextResponse.json({
      success: true,
      mergedGroups: mergeLog.length,
      details: mergeLog,
    });
  } catch (error) {
    console.error('[merge] ❌ FAILED:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Merge failed' },
      { status: 500 }
    );
  }
}
