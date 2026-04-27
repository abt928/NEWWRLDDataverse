import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';

/** GET /api/songcash/leads — Fetch all Songcash leads with artist info */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const leads = await (prisma as any).songcashLead.findMany({
    include: {
      artist: {
        select: {
          id: true,
          name: true,
          genre: true,
          pipelineStage: true,
          source: true,
          distrokidUploadedAt: true,
          _count: {
            select: {
              distrokidData: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(leads);
}

/** PATCH /api/songcash/leads — Update a lead's status or notes */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, status, notes, internalDealConfig, internalDealOutput } = await req.json();
  if (!id) {
    return NextResponse.json({ error: 'Lead ID required' }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};
  if (status !== undefined) updateData.status = status;
  if (notes !== undefined) updateData.notes = notes;
  if (internalDealConfig !== undefined) updateData.dealConfig = internalDealConfig;
  if (internalDealOutput !== undefined) updateData.dealOutput = internalDealOutput;

  const lead = await (prisma as any).songcashLead.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json(lead);
}
