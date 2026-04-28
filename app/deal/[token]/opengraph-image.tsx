import { ImageResponse } from 'next/og';
import prisma from '@/lib/db';

export const runtime = 'nodejs';
export const alt = 'Deal Calculator';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OGImage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let artistName = 'Artist';
  let label = 'Deal Calculator';
  let branding = 'NEWWRLD';

  try {
    const share = await prisma.dealShare.findUnique({
      where: { token },
      select: {
        label: true,
        branding: true,
        artist: { select: { name: true } },
      },
    });
    if (share) {
      artistName = share.artist.name;
      if (share.label) label = share.label;
      if (share.branding) branding = share.branding;
    }
  } catch {
    // Fallback to defaults
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(145deg, #09090b 0%, #0e0e11 40%, #131316 100%)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Gradient orb - top right */}
        <div
          style={{
            position: 'absolute',
            top: '-120px',
            right: '-80px',
            width: '500px',
            height: '500px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
            display: 'flex',
          }}
        />
        {/* Gradient orb - bottom left */}
        <div
          style={{
            position: 'absolute',
            bottom: '-150px',
            left: '-100px',
            width: '600px',
            height: '600px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)',
            display: 'flex',
          }}
        />

        {/* Top bar */}
        <div
          style={{
            position: 'absolute',
            top: '40px',
            left: '60px',
            right: '60px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              fontSize: '18px',
              fontWeight: 700,
              color: '#6366f1',
              letterSpacing: '0.15em',
              display: 'flex',
            }}
          >
            NEWWRLD
          </div>
          <div
            style={{
              fontSize: '14px',
              color: '#5a5c72',
              display: 'flex',
            }}
          >
            DEAL CALCULATOR
          </div>
        </div>

        {/* Center content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          {/* Artist name */}
          <div
            style={{
              fontSize: '72px',
              fontWeight: 700,
              letterSpacing: '-0.03em',
              color: '#f5f5f7',
              display: 'flex',
              textAlign: 'center',
              lineHeight: 1.1,
              maxWidth: '900px',
            }}
          >
            {artistName}
          </div>

          {/* × NEWWRLD */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              marginTop: '4px',
            }}
          >
            <div
              style={{
                width: '60px',
                height: '1px',
                background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.5))',
                display: 'flex',
              }}
            />
            <div
              style={{
                fontSize: '20px',
                fontWeight: 500,
                color: '#818cf8',
                letterSpacing: '0.12em',
                display: 'flex',
              }}
            >
              × {branding}
            </div>
            <div
              style={{
                width: '60px',
                height: '1px',
                background: 'linear-gradient(90deg, rgba(99,102,241,0.5), transparent)',
                display: 'flex',
              }}
            />
          </div>
        </div>

        {/* Bottom CTA */}
        <div
          style={{
            position: 'absolute',
            bottom: '50px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '14px 32px',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.1))',
            border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: '12px',
          }}
        >
          <div
            style={{
              fontSize: '18px',
              fontWeight: 600,
              color: '#e4e4e7',
              display: 'flex',
            }}
          >
            Customize Your Offer
          </div>
          <div
            style={{
              fontSize: '18px',
              color: '#818cf8',
              display: 'flex',
            }}
          >
            →
          </div>
        </div>

        {/* Subtle border */}
        <div
          style={{
            position: 'absolute',
            inset: '0',
            border: '1px solid rgba(99,102,241,0.08)',
            borderRadius: '0',
            display: 'flex',
          }}
        />
      </div>
    ),
    {
      ...size,
    }
  );
}
