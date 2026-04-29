import { ImageResponse } from 'next/og';
import prisma from '@/lib/db';

export const runtime = 'nodejs';
export const alt = 'Deal Calculator';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/* ── Brand Palettes ── */
const BRAND_STYLES: Record<string, {
  bg: string;
  orbA: string;
  orbB: string;
  accent: string;
  accentLight: string;
  accentGlow: string;
  text: string;
  textSub: string;
  ctaBg: string;
  ctaBorder: string;
  border: string;
  logoRender: (s: { accent: string; text: string }) => React.ReactNode;
}> = {
  SONGCASH: {
    bg: 'linear-gradient(145deg, #060a12 0%, #0a1020 40%, #0d1428 100%)',
    orbA: 'radial-gradient(circle, rgba(34,211,238,0.14) 0%, transparent 70%)',
    orbB: 'radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 70%)',
    accent: '#22d3ee',
    accentLight: '#67e8f9',
    accentGlow: 'rgba(34,211,238,0.15)',
    text: '#f0f0f0',
    textSub: '#64748b',
    ctaBg: 'linear-gradient(135deg, rgba(34,211,238,0.1), rgba(6,182,212,0.08))',
    ctaBorder: 'rgba(34,211,238,0.3)',
    border: 'rgba(34,211,238,0.06)',
    logoRender: ({ accent, text }) => (
      <div style={{ display: 'flex', fontSize: '20px', fontWeight: 800, letterSpacing: '0.12em' }}>
        <span style={{ color: text }}>SONG</span>
        <span style={{ color: accent }}>CASH</span>
      </div>
    ),
  },
  ANTIGRAVITY: {
    bg: 'linear-gradient(145deg, #f5f5f0 0%, #ececea 40%, #e5e5e2 100%)',
    orbA: 'radial-gradient(circle, rgba(0,0,0,0.03) 0%, transparent 70%)',
    orbB: 'radial-gradient(circle, rgba(0,0,0,0.02) 0%, transparent 70%)',
    accent: '#111111',
    accentLight: '#333333',
    accentGlow: 'rgba(0,0,0,0.06)',
    text: '#111111',
    textSub: '#999999',
    ctaBg: 'linear-gradient(135deg, rgba(0,0,0,0.04), rgba(0,0,0,0.02))',
    ctaBorder: 'rgba(0,0,0,0.12)',
    border: 'rgba(0,0,0,0.05)',
    logoRender: ({ accent }) => (
      <div style={{ display: 'flex', fontSize: '20px', fontWeight: 900, letterSpacing: '-0.01em', color: '#111' }}>
        Antigravity<span style={{ color: accent }}>.</span>marketing
      </div>
    ),
  },
  NEWWRLD: {
    bg: 'linear-gradient(145deg, #09090b 0%, #0e0e11 40%, #131316 100%)',
    orbA: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
    orbB: 'radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)',
    accent: '#6366f1',
    accentLight: '#818cf8',
    accentGlow: 'rgba(99,102,241,0.15)',
    text: '#f5f5f7',
    textSub: '#71717a',
    ctaBg: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))',
    ctaBorder: 'rgba(99,102,241,0.3)',
    border: 'rgba(99,102,241,0.06)',
    logoRender: ({ accent }) => (
      <div style={{ display: 'flex', fontSize: '20px', fontWeight: 800, letterSpacing: '0.15em', color: accent }}>
        NEWWRLD
      </div>
    ),
  },
};

export default async function OGImage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let artistName = 'Artist';
  let branding = 'NEWWRLD';

  try {
    const share = await prisma.dealShare.findUnique({
      where: { token },
      select: {
        branding: true,
        artist: { select: { name: true } },
      },
    });
    if (share) {
      artistName = share.artist.name;
      if (share.branding) branding = share.branding;
    }
  } catch {
    // Fallback to defaults
  }

  const s = BRAND_STYLES[branding] || BRAND_STYLES.NEWWRLD;

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
          background: s.bg,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Gradient orb — top right */}
        <div
          style={{
            position: 'absolute',
            top: '-120px',
            right: '-80px',
            width: '500px',
            height: '500px',
            borderRadius: '50%',
            background: s.orbA,
            display: 'flex',
          }}
        />
        {/* Gradient orb — bottom left */}
        <div
          style={{
            position: 'absolute',
            bottom: '-150px',
            left: '-100px',
            width: '600px',
            height: '600px',
            borderRadius: '50%',
            background: s.orbB,
            display: 'flex',
          }}
        />

        {/* ── Top Bar ── */}
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
          {s.logoRender({ accent: s.accent, text: s.text })}
          <div
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: s.textSub,
              letterSpacing: '0.12em',
              display: 'flex',
            }}
          >
            DEAL CALCULATOR
          </div>
        </div>

        {/* ── Center Content ── */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px',
          }}
        >
          {/* Brand × Artist */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              fontSize: '18px',
              fontWeight: 600,
              color: s.accentLight,
              letterSpacing: '0.1em',
            }}
          >
            <div style={{ width: '50px', height: '1px', background: `linear-gradient(90deg, transparent, ${s.accentGlow})`, display: 'flex' }} />
            {branding} × {artistName}
            <div style={{ width: '50px', height: '1px', background: `linear-gradient(90deg, ${s.accentGlow}, transparent)`, display: 'flex' }} />
          </div>

          {/* Main Headline */}
          <div
            style={{
              fontSize: '68px',
              fontWeight: 700,
              letterSpacing: '-0.03em',
              color: s.text,
              display: 'flex',
              textAlign: 'center',
              lineHeight: 1.05,
              maxWidth: '900px',
            }}
          >
            Your Offer is Here
          </div>
        </div>

        {/* ── Bottom CTA ── */}
        <div
          style={{
            position: 'absolute',
            bottom: '50px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '14px 36px',
            background: s.ctaBg,
            border: `1px solid ${s.ctaBorder}`,
            borderRadius: '100px',
          }}
        >
          <div
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: s.text,
              letterSpacing: '0.04em',
              display: 'flex',
            }}
          >
            Customize Your Deal
          </div>
          <div
            style={{
              fontSize: '18px',
              color: s.accentLight,
              display: 'flex',
            }}
          >
            →
          </div>
        </div>

        {/* Subtle outer border */}
        <div
          style={{
            position: 'absolute',
            inset: '0',
            border: `1px solid ${s.border}`,
            display: 'flex',
          }}
        />
      </div>
    ),
    { ...size }
  );
}
