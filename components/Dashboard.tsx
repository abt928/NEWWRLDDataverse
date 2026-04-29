'use client';
import { useState, useMemo, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { signIn as passkeySignIn } from 'next-auth/webauthn';
import type { LuminateDataset, DistroKidDataset, FilterState, DealConfig } from '@/lib/types';
import { defaultFilters, defaultDealConfig, computeOverviewKPIs, computeSongAggregations, computeReleaseGroupAggregations, computeGrowthMetrics, computeDealInsights, computeCatalogComposition, computeArtistTimeline } from '@/lib/analytics';
import OverviewPanel from './panels/OverviewPanel';
import ArtistTimelinePanel from './panels/ArtistTimelinePanel';
import ReleaseTablePanel from './panels/ReleaseTablePanel';
import SongRankingsPanel from './panels/SongRankingsPanel';
import SongTrendsPanel from './panels/SongTrendsPanel';
import CatalogPanel from './panels/CatalogPanel';
import GrowthPanel from './panels/GrowthPanel';
import DealPanel from './panels/DealPanel';
import RevenuePanel from './panels/RevenuePanel';
import CpmPanel from './panels/CpmPanel';
import CommandBar from './CommandBar';
import GeoPanel from './panels/GeoPanel';
import DataIntegrityPanel from './panels/DataIntegrityPanel';
import OfferCalculatorPanel from './panels/OfferCalculatorPanel';
import { ReportProvider, useReport, METRIC_LABELS } from './ReportContext';

interface NavItem {
  id: string;
  label: string;
  icon: string;
  source?: 'luminate' | 'distrokid';
}

const ALL_NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: '●' },
  { id: 'timeline', label: 'Artist Timeline', icon: '◆', source: 'luminate' },
  { id: 'releases', label: 'Releases', icon: '◇', source: 'luminate' },
  { id: 'songs', label: 'Song Rankings', icon: '♪', source: 'luminate' },
  { id: 'trends', label: 'Song Trends', icon: '∿', source: 'luminate' },
  { id: 'catalog', label: 'Catalog Mix', icon: '◎', source: 'luminate' },
  { id: 'growth', label: 'Growth Metrics', icon: '↗', source: 'luminate' },
  { id: 'geo', label: 'Geo Data', icon: '◉', source: 'luminate' },
  { id: 'cpm', label: 'CPM Calculator', icon: '≡' },
  { id: 'revenue', label: 'Revenue & Platforms', icon: '$', source: 'distrokid' },
  { id: 'deal', label: 'Deal Intelligence', icon: '▲' },
  { id: 'offercalc', label: 'Offer Calculator', icon: '◈' },
  { id: 'integrity', label: 'Data Integrity', icon: '⊘' },
  { id: 'contracts', label: 'Contract System', icon: '⚖' },
  { id: 'outreach', label: 'Artist Outreach', icon: '✉' },
];

function EmptyState({ source, label }: { source: string; label: string }) {
  return (
    <div className="panel-empty-state">
      <div className="empty-state-icon" aria-hidden="true">—</div>
      <h3>No {label} Data Yet</h3>
      <p>Drop a <strong>{source}</strong> file on the home page to unlock this panel.</p>
      <a href="/" className="btn-primary" style={{ display: 'inline-block', marginTop: '1rem', fontSize: '0.85rem' }}>← Upload Files</a>
    </div>
  );
}

interface ManualRevenueEntry {
  id: string;
  month: string;
  amount: number;
  note: string;
}

interface DashboardProps {
  data?: LuminateDataset;
  distrokid?: DistroKidDataset;
  onReset: () => void;
  artistId?: string;
  luminateUploadedAt?: string | null;
  distrokidUploadedAt?: string | null;
  manualRevenue?: ManualRevenueEntry[];
  uploads?: UploadRecord[];
  geoBreakdown?: Record<string, { worldwide: number; us: number; mx: number; other: number }> | null;
  geoSummary?: { hasGeoData: boolean; locations: { location: string; weeks: number; totalStreams: number }[] };
  dataCoverage?: DataCoverageEntry[];
}

interface DataCoverageEntry {
  location: string;
  weekCount: number;
  totalStreams: number;
  firstWeek: { week: number; year: number } | null;
  lastWeek: { week: number; year: number } | null;
  gaps: { fromWeek: number; fromYear: number; toWeek: number; toYear: number; missingWeeks: number }[];
}

interface UploadRecord {
  id: string;
  fileName: string;
  fileType: string;
  location: string;
  weekCount: number;
  songCount: number;
  totalStreams: number;
  uploadedAt: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export default function Dashboard({ data, distrokid, onReset, artistId, luminateUploadedAt, distrokidUploadedAt, manualRevenue: initialRevenue = [], uploads = [], geoBreakdown, geoSummary, dataCoverage = [] }: DashboardProps) {
  const { data: session } = useSession();
  const hasLuminate = !!data;
  const hasDistroKid = !!distrokid;
  const [revenueEntries, setRevenueEntries] = useState<ManualRevenueEntry[]>(initialRevenue);

  const navItems = ALL_NAV_ITEMS;

  const defaultPanel = hasLuminate ? 'overview' : 'revenue';
  const [active, setActive] = useState(defaultPanel);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [dealConfig, setDealConfig] = useState<DealConfig>(defaultDealConfig);
  const [copied, setCopied] = useState(false);

  const kpis = useMemo(() => data ? computeOverviewKPIs(data, filters) : null, [data, filters]);
  const songs = useMemo(() => data ? computeSongAggregations(data, filters) : [], [data, filters]);
  const releases = useMemo(() => data ? computeReleaseGroupAggregations(data, filters) : [], [data, filters]);
  const growth = useMemo(() => data ? computeGrowthMetrics(data) : null, [data]);
  const deal = useMemo(() => data ? computeDealInsights(data, filters, dealConfig, distrokid) : null, [data, filters, dealConfig, distrokid]);
  const catalog = useMemo(() => data ? computeCatalogComposition(data, filters) : null, [data, filters]);
  const timeline = useMemo(() => data ? computeArtistTimeline(data) : [], [data]);

  const shareUrl = artistId ? `${typeof window !== 'undefined' ? window.location.origin : ''}/artist/${artistId}` : null;

  const handleShare = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textArea = document.createElement('textarea');
      textArea.value = shareUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [shareUrl]);

  const handleExport = useCallback(async () => {
    if (!artistId) return;
    window.open(`/api/export/pdf/${artistId}`, '_blank');
  }, [artistId]);

  const artistName = kpis?.artistName || distrokid?.artistName || 'Unknown';
  const genre = kpis?.genre || 'Music';
  const userInitial = session?.user?.name?.charAt(0)?.toUpperCase() || session?.user?.email?.charAt(0)?.toUpperCase() || '?';

  return (
    <ReportProvider>
    <div className="dashboard">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <a href="/" className="sidebar-brand-link">
            <h2><span className="brand-shimmer">NEWWRLD</span> <span className="auth-brand-sub">DATAVERSE</span></h2>
          </a>
          <div className="artist-name">{artistName} • {genre}</div>
          <div className="data-sources-badge">
            <span className={`source-dot ${hasLuminate ? 'luminate' : 'inactive'}`} />Luminate
            <span className={`source-dot ${hasDistroKid ? 'distrokid' : 'inactive'}`} />DistroKid
          </div>
        </div>
        <ul className="sidebar-nav" role="tablist" aria-label="Dashboard panels">
          <li className="nav-section" role="presentation">Streaming</li>
          {navItems.filter(i => ['overview','timeline','releases','songs','trends'].includes(i.id)).map((item) => (
            <li key={item.id} role="presentation">
              <button
                role="tab"
                aria-selected={active === item.id ? 'true' : 'false'}
                className={active === item.id ? 'active' : ''}
                onClick={() => setActive(item.id)}
              >
                <span className="nav-icon" aria-hidden="true">{item.icon}</span>{item.label}
              </button>
            </li>
          ))}
          <li className="nav-section" role="presentation">Analysis</li>
          {navItems.filter(i => ['catalog','growth','geo'].includes(i.id)).map((item) => (
            <li key={item.id} role="presentation">
              <button
                role="tab"
                aria-selected={active === item.id ? 'true' : 'false'}
                className={active === item.id ? 'active' : ''}
                onClick={() => setActive(item.id)}
              >
                <span className="nav-icon" aria-hidden="true">{item.icon}</span>{item.label}
              </button>
            </li>
          ))}
          <li className="nav-section" role="presentation">Business</li>
          {navItems.filter(i => ['cpm','revenue','deal','offercalc','integrity'].includes(i.id)).map((item) => (
            <li key={item.id} role="presentation">
              <button
                role="tab"
                aria-selected={active === item.id ? 'true' : 'false'}
                className={active === item.id ? 'active' : ''}
                onClick={() => setActive(item.id)}
              >
                <span className="nav-icon" aria-hidden="true">{item.icon}</span>{item.label}
              </button>
            </li>
          ))}
          <li className="nav-section" role="presentation">Tools</li>
          {navItems.filter(i => ['contracts','outreach'].includes(i.id)).map((item) => (
            <li key={item.id} role="presentation">
              <button
                role="tab"
                aria-selected={active === item.id ? 'true' : 'false'}
                className={`${active === item.id ? 'active' : ''} nav-upsell`}
                onClick={() => setActive(item.id)}
              >
                <span className="nav-icon" aria-hidden="true">{item.icon}</span>{item.label}
                <span className="nav-soon-badge">Soon</span>
              </button>
            </li>
          ))}
        </ul>

        {artistId && (
          <div className="sidebar-actions">
            <button className="btn-sidebar" onClick={handleShare}>
              {copied ? '✓ Link Copied!' : 'Share Link'}
            </button>
            <button className="btn-sidebar" onClick={handleExport}>
              Export PDF
            </button>
          </div>
        )}

        {/* Report Builder */}
        <ReportSection />



        <div className="sidebar-footer">
          <button onClick={onReset}>← All Artists</button>
        </div>

        {/* User Info */}
        {session?.user && (
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">{userInitial}</div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{session.user.name || 'User'}</div>
              <div className="sidebar-user-email">{session.user.email}</div>
            </div>
            <button className="sidebar-passkey" onClick={() => passkeySignIn('passkey', { action: 'register' })} title="Register passkey">Key</button>
            <button className="sidebar-signout" onClick={() => signOut()} title="Sign out">Out</button>
          </div>
        )}
      </aside>
      <main className="main-content" role="tabpanel">
        <CommandBar activePanel={active} filters={filters} onChange={setFilters} />
        <div className="panel-enter" key={active}>
        {active === 'overview' && (kpis && growth ? <OverviewPanel kpis={kpis} growth={growth} timeline={timeline} distrokid={distrokid} uploads={uploads} luminateUploadedAt={luminateUploadedAt} distrokidUploadedAt={distrokidUploadedAt} /> : <EmptyState source="Luminate (.xlsx)" label="Streaming" />)}
        {active === 'contracts' && <UpsellPanel type="contracts" />}
        {active === 'outreach' && <UpsellPanel type="outreach" />}
        {active === 'timeline' && (growth ? <ArtistTimelinePanel timeline={timeline} growth={growth} /> : <EmptyState source="Luminate (.xlsx)" label="Timeline" />)}
        {active === 'releases' && (releases.length > 0 ? <ReleaseTablePanel releases={releases} /> : <EmptyState source="Luminate (.xlsx)" label="Release" />)}
        {active === 'songs' && (songs.length > 0 ? <SongRankingsPanel songs={songs} /> : <EmptyState source="Luminate (.xlsx)" label="Song" />)}
        {active === 'trends' && (songs.length > 0 ? <SongTrendsPanel songs={songs} /> : <EmptyState source="Luminate (.xlsx)" label="Song Trend" />)}
        {active === 'catalog' && (catalog ? <CatalogPanel catalog={catalog} /> : <EmptyState source="Luminate (.xlsx)" label="Catalog" />)}
        {active === 'growth' && (growth && kpis ? <GrowthPanel growth={growth} kpis={kpis} /> : <EmptyState source="Luminate (.xlsx)" label="Growth" />)}
        {active === 'cpm' && <CpmPanel artistId={artistId} entries={revenueEntries} onUpdate={setRevenueEntries} data={data} />}
        {active === 'revenue' && (distrokid ? <RevenuePanel data={distrokid} /> : <EmptyState source="DistroKid (.zip)" label="Revenue" />)}
        {active === 'deal' && (deal && kpis ? <DealPanel deal={deal} kpis={kpis} distrokid={distrokid} manualRevenue={revenueEntries} luminateData={data} /> : distrokid ? <DealPanel deal={null as any} kpis={null as any} distrokid={distrokid} manualRevenue={revenueEntries} luminateData={data} /> : <EmptyState source="Luminate (.xlsx) or DistroKid (.zip)" label="Deal" />)}
        {active === 'geo' && (geoBreakdown && geoSummary?.hasGeoData ? <GeoPanel geoBreakdown={geoBreakdown} geoSummary={geoSummary} activeCpm={deal ? (deal as any).cpm || null : null} /> : <EmptyState source="geo-specific Luminate (.xlsx)" label="Geographic" />)}
        {active === 'integrity' && <DataIntegrityPanel dataCoverage={dataCoverage} uploads={uploads} distrokid={distrokid} />}
        </div>
        {/* Offer Calculator persists outside keyed wrapper so state survives tab switches */}
        <div style={{ display: active === 'offercalc' ? 'block' : 'none' }}>
          <OfferCalculatorPanel distrokid={distrokid} artistId={artistId} />
        </div>
      </main>
    </div>
    </ReportProvider>
  );
}

/** Sidebar report builder section */
function ReportSection() {
  const { pinnedKeys, togglePin, clearAll } = useReport();
  if (pinnedKeys.length === 0) return null;
  return (
    <div className="report-section">
      <div className="report-section-header">
        <span className="report-section-title">Report <span className="report-section-count">{pinnedKeys.length}</span></span>
        <button className="report-clear-btn" onClick={clearAll}>Clear all</button>
      </div>
      <div className="report-items">
        {pinnedKeys.map(key => (
          <div key={key} className="report-item">
            <span className="report-item-label">{METRIC_LABELS[key] || key}</span>
            <button className="report-item-remove" onClick={() => togglePin(key)} title="Remove">✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Upsell panel for upcoming features */
function UpsellPanel({ type }: { type: 'contracts' | 'outreach' }) {
  const content = type === 'contracts' ? {
    icon: '⚖',
    title: 'Contract System',
    subtitle: 'Know what you actually own.',
    description: 'Your contracts are currently stored in a combination of email threads, napkin drawings, and vibes. That\'s... a choice.',
    features: [
      'Track master vs. publishing splits per-song',
      'Set reversion dates and get alerts before they expire',
      'Auto-calculate remaining obligation payouts',
      'Store executed agreements with version history',
    ],
    cta: 'Coming Soon™',
    footnote: 'We promise it\'s better than Ctrl+F\'ing your Gmail.',
  } : {
    icon: '✉',
    title: 'Artist Outreach',
    subtitle: 'Stop cold-DMing from your personal Instagram.',
    description: 'Bold strategy, messaging artists at 2am from an account with 47 followers. Let us help you look like you\'ve done this before.',
    features: [
      'CRM pipeline for artist relationships',
      'Templated offer letters with auto-populated deal terms',
      'Track response rates and follow-up cadence',
      'Integration with streaming data for informed outreach',
    ],
    cta: 'Coming Soon™',
    footnote: '"hey bro i love ur music lets work" is not a pitch. We can fix that.',
  };

  return (
    <div className="upsell-panel">
      <div className="upsell-card">
        <div className="upsell-icon">{content.icon}</div>
        <h2 className="upsell-title">{content.title}</h2>
        <p className="upsell-subtitle">{content.subtitle}</p>
        <p className="upsell-description">{content.description}</p>
        <ul className="upsell-features">
          {content.features.map((f, i) => (
            <li key={i}><span className="upsell-check">✓</span> {f}</li>
          ))}
        </ul>
        <button className="upsell-cta" disabled>{content.cta}</button>
        <p className="upsell-footnote">{content.footnote}</p>
      </div>
    </div>
  );
}
