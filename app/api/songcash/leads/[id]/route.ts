import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';

/** GET /api/songcash/leads/[id] — Fetch a single lead with full details */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const lead = await prisma.songcashLead.findUnique({
    where: { id },
    include: {
      artist: {
        include: {
          distrokidData: true,
          uploads: true,
        },
      },
    },
  });

  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  return NextResponse.json(lead);
}

/** PATCH /api/songcash/leads/[id] — Update lead status, notes, or deal config */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const updateData: Record<string, unknown> = {};
  if (body.status !== undefined) updateData.status = body.status;
  if (body.notes !== undefined) updateData.notes = body.notes;
  if (body.dealConfig !== undefined) updateData.dealConfig = body.dealConfig;
  if (body.dealOutput !== undefined) updateData.dealOutput = body.dealOutput;

  // Also update artist pipeline stage if status changes
  if (body.status === 'offered') {
    const lead = await prisma.songcashLead.findUnique({ where: { id } });
    if (lead) {
      await prisma.artist.update({
        where: { id: lead.artistId },
        data: { pipelineStage: 'negotiation' },
      });
    }
  }

  const updated = await prisma.songcashLead.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json(updated);
}
