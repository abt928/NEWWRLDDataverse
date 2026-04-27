import { NextRequest, NextResponse } from 'next/server';
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

function dedupeKey(name: string): string {
  return normalizeArtistName(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

interface SongcashEntry {
  saleMonth: string;
  store: string;
  artist: string;
  title: string;
  isrc: string;
  country: string;
  quantity: number;
  earnings: number;
  teamPercentage: number;
}

interface SongcashSubmission {
  entries: SongcashEntry[];
  artistName: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  spotifyUrl?: string;
  dealConfig?: Record<string, unknown>;
  dealOutput?: Record<string, unknown>;
}

/**
 * Public API endpoint for Songcash website submissions.
 * No session auth required — protected by API key.
 * Accepts streaming data + contact info + deal calculator config.
 */
export async function POST(req: NextRequest) {
  try {
    // ── API Key Auth ──
    const apiKey = req.headers.get('x-songcash-api-key');
    const expectedKey = process.env.SONGCASH_API_KEY;
    if (!expectedKey || apiKey !== expectedKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: SongcashSubmission = await req.json();
    const { entries, artistName: rawArtistName, contactName, contactEmail, contactPhone, spotifyUrl, dealConfig, dealOutput } = body;

    if (!entries || !entries.length) {
      return NextResponse.json({ error: 'No entries provided' }, { status: 400 });
    }

    const artistName = normalizeArtistName(rawArtistName);
    const myKey = dedupeKey(artistName);
    console.log(`[songcash-submit] ${entries.length} entries for "${rawArtistName}" → normalized: "${artistName}"`);

    // ── Find or Create Artist ──
    const systemUser = await prisma.user.findFirst({ where: { email: 'system@songcash.com' } });
    const userId = systemUser?.id ?? (await prisma.user.create({
      data: { email: 'system@songcash.com', name: 'Songcash System' },
    })).id;

    const existingArtists = await prisma.artist.findMany();
    let artist = existingArtists.find((a) => dedupeKey(a.name) === myKey) || null;

    if (artist) {
      artist = await prisma.artist.update({
        where: { id: artist.id },
        data: {
          distrokidUploadedAt: new Date(),
          source: 'songcash',
          pipelineStage: 'offer',
        } as any,
      });
    } else {
      artist = await prisma.artist.create({
        data: {
          name: artistName,
          userId,
          distrokidUploadedAt: new Date(),
          source: 'songcash',
          pipelineStage: 'offer',
        } as any,
      });
    }

    // ── Bulk Insert DK Data ──
    const createData = entries.map((e) => ({
      artistId: artist!.id,
      saleMonth: e.saleMonth || '',
      store: e.store || '',
      title: e.title || '',
      isrc: e.isrc || '',
      country: e.country || '',
      quantity: e.quantity || 0,
      earnings: e.earnings || 0,
      teamPercentage: e.teamPercentage ?? 100,
    }));

    const result = await prisma.distroKidMonthly.createMany({
      data: createData,
      skipDuplicates: true,
    });

    console.log(`[songcash-submit] ✅ ${result.count} rows inserted for "${artistName}"`);

    // ── Create Lead if contact info provided ──
    let leadId: string | null = null;
    if (contactName && contactEmail) {
      const lead = await (prisma as any).songcashLead.create({
        data: {
          artistId: artist.id,
          name: contactName,
          email: contactEmail,
          phone: contactPhone || '',
          spotifyUrl: spotifyUrl || '',
          dealConfig: (dealConfig || {}) as any,
          dealOutput: (dealOutput || {}) as any,
          status: 'new',
        },
      });
      leadId = lead.id;
      console.log(`[songcash-submit] 📩 Lead created: ${contactName} <${contactEmail}> → ${leadId}`);
    }

    // ── Track Upload ──
    const totalStreams = entries.reduce((s, e) => s + (e.quantity || 0), 0);
    const months = [...new Set(entries.map(e => e.saleMonth).filter(Boolean))];
    try {
      await prisma.artistUpload.create({
        data: {
          artistId: artist.id,
          fileName: `Songcash Submission (${months.length} months)`,
          fileType: 'distrokid',
          location: 'Worldwide',
          weekCount: months.length,
          songCount: new Set(entries.map(e => e.isrc || e.title)).size,
          totalStreams: BigInt(totalStreams),
        },
      });
    } catch { /* skip if upload tracking fails */ }

    return NextResponse.json({
      success: true,
      artistId: artist.id,
      artistName: artist.name,
      rowsProcessed: result.count,
      leadId,
    });
  } catch (error) {
    console.error('[songcash-submit] ❌ FAILED:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Submission failed' },
      { status: 500 },
    );
  }
}

/** CORS preflight */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-songcash-api-key',
    },
  });
}
