import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';

const VALID_STAGES = ['research', 'review', 'negotiation', 'closed'];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { stage } = await req.json();

    if (!VALID_STAGES.includes(stage)) {
      return NextResponse.json({ error: `Invalid stage. Must be one of: ${VALID_STAGES.join(', ')}` }, { status: 400 });
    }

    const artist = await prisma.artist.update({
      where: { id },
      data: { pipelineStage: stage },
      select: { id: true, name: true, pipelineStage: true },
    });

    return NextResponse.json(artist);
  } catch (error) {
    console.error('[stage] Error:', error);
    return NextResponse.json({ error: 'Failed to update stage' }, { status: 500 });
  }
}
