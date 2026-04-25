'use client';
import { useState, useMemo, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { signIn as passkeySignIn } from 'next-auth/webauthn';
import type { LuminateDataset, DistroKidDataset, FilterState } from '@/lib/types';
import { defaultFilters, computeOverviewKPIs, computeSongAggregations, computeReleaseGroupAggregations, computeGrowthMetrics, computeDealInsights, computeCatalogComposition, computeArtistTimeline } from '@/lib/analytics';
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
import FilterBar from './FilterBar';
import GeoPanel from './panels/GeoPanel';

interface NavItem {
  id: string;
  label: string;
  icon: string;
  source?: 'luminate' | 'distrokid';
}

const ALL_NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'timeline', label: 'Artist Timeline', icon: '📈', source: 'luminate' },
  { id: 'releases', label: 'Releases', icon: '💿', source: 'luminate' },
  { id: 'songs', label: 'Song Rankings', icon: '🎵', source: 'luminate' },
  { id: 'trends', label: 'Song Trends', icon: '📉', source: 'luminate' },
  { id: 'catalog', label: 'Catalog Mix', icon: '🎯', source: 'luminate' },
  { id: 'growth', label: 'Growth Metrics', icon: '🚀', source: 'luminate' },
  { id: 'geo', label: 'Geo Data', icon: '🌍', source: 'luminate' },
  { id: 'cpm', label: 'CPM Calculator', icon: '🧮' },
  { id: 'revenue', label: 'Revenue & Platforms', icon: '💵', source: 'distrokid' },
  { id: 'deal', label: 'Deal Intelligence', icon: '💰' },
];

function EmptyState({ source, label }: { source: string; label: string }) {
  return (
    <div className="panel-empty-state">
      <div className="empty-state-icon">📂</div>
      <h3>No {label} Data Yet</h3>
      <p>Upload a <strong>{source}</strong> file to populate this panel.</p>
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

export default function Dashboard({ data, distrokid, onReset, artistId, luminateUploadedAt, distrokidUploadedAt, manualRevenue: initialRevenue = [], uploads = [], geoBreakdown, geoSummary }: DashboardProps) {
  const { data: session } = useSession();
  const hasLuminate = !!data;
  const hasDistroKid = !!distrokid;
  const [revenueEntries, setRevenueEntries] = useState<ManualRevenueEntry[]>(initialRevenue);

  const navItems = ALL_NAV_ITEMS;

  const defaultPanel = hasLuminate ? 'overview' : 'revenue';
  const [active, setActive] = useState(defaultPanel);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [copied, setCopied] = useState(false);

  const kpis = useMemo(() => data ? computeOverviewKPIs(data) : null, [data]);
  const songs = useMemo(() => data ? computeSongAggregations(data, filters) : [], [data, filters]);
  const releases = useMemo(() => data ? computeReleaseGroupAggregations(data, filters) : [], [data, filters]);
  const growth = useMemo(() => data ? computeGrowthMetrics(data) : null, [data]);
  const deal = useMemo(() => data ? computeDealInsights(data, filters) : null, [data, filters]);
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
    <div className="dashboard">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <a href="/" className="sidebar-brand-link">
            <h2>NEWWRLD <span className="auth-brand-sub">DATAVERSE</span></h2>
          </a>
          <div className="artist-name">{artistName} • {genre}</div>
          <div className="data-sources-badge">
            <span className={`source-dot ${hasLuminate ? 'luminate' : 'inactive'}`} />Luminate
            <span className={`source-dot ${hasDistroKid ? 'distrokid' : 'inactive'}`} />DistroKid
          </div>
        </div>
        <ul className="sidebar-nav">
          {navItems.map((item) => (
            <li key={item.id}>
              <button
                className={active === item.id ? 'active' : ''}
                onClick={() => setActive(item.id)}
              >
                <span className="nav-icon">{item.icon}</span>{item.label}
              </button>
            </li>
          ))}
        </ul>

        {artistId && (
          <div className="sidebar-actions">
            <button className="btn-sidebar" onClick={handleShare}>
              {copied ? '✓ Link Copied!' : '🔗 Share Link'}
            </button>
            <button className="btn-sidebar" onClick={handleExport}>
              📄 Export PDF
            </button>
          </div>
        )}

        {/* Upload Inventory */}
        <div className="sidebar-upload-status">
          <div className="upload-section-title">Uploaded Files</div>
          {uploads.length > 0 ? (
            uploads.map((u) => {
              const geoFlag = u.location === 'Mexico' ? '🇲🇽' : u.location === 'United States' ? '🇺🇸' : u.location === 'Worldwide' ? '🌎' : '📍';
              const typeLabel = u.fileType === 'luminate-trends' ? 'Trends' : u.fileType === 'distrokid' ? 'DK' : 'QBR';
              return (
                <div key={u.id} className="upload-file-row">
                  <span className="upload-file-geo">{geoFlag}</span>
                  <div className="upload-file-info">
                    <div className="upload-file-name">{u.location} <span className="upload-file-type">{typeLabel}</span></div>
                    <div className="upload-file-meta">
                      {u.weekCount}w • {u.totalStreams > 1_000_000 ? `${(u.totalStreams / 1_000_000).toFixed(1)}M` : u.totalStreams > 1000 ? `${(u.totalStreams / 1000).toFixed(0)}K` : u.totalStreams} streams
                      {u.songCount > 0 && ` • ${u.songCount} songs`}
                    </div>
                  </div>
                  <span className="upload-file-time">{timeAgo(u.uploadedAt)}</span>
                </div>
              );
            })
          ) : (
            <div className="upload-status-item">
              <span className="status-icon">📊</span>
              Luminate —{' '}
              <span className="status-date">
                {luminateUploadedAt ? timeAgo(luminateUploadedAt) : 'Not uploaded'}
              </span>
            </div>
          )}
          {hasDistroKid && (
            <div className="upload-file-row">
              <span className="upload-file-geo">📦</span>
              <div className="upload-file-info">
                <div className="upload-file-name">DistroKid <span className="upload-file-type">CSV</span></div>
                <div className="upload-file-meta">{distrokid?.monthlyRevenue?.length || 0} months</div>
              </div>
              <span className="upload-file-time">{distrokidUploadedAt ? timeAgo(distrokidUploadedAt) : ''}</span>
            </div>
          )}
          <div className="upload-formats-ref">
            <div className="upload-formats-title">Accepted Formats</div>
            <div className="upload-format-item"><span className="format-dot qbr" />Luminate QBR (.xlsx)</div>
            <div className="upload-format-item"><span className="format-dot trends" />Luminate Activity Over Time (.xlsx)</div>
            <div className="upload-format-item"><span className="format-dot dk" />DistroKid Earnings (.tsv)</div>
          </div>
        </div>

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
            <button className="sidebar-passkey" onClick={() => passkeySignIn('passkey', { action: 'register' })} title="Register passkey">🔑</button>
            <button className="sidebar-signout" onClick={() => signOut()} title="Sign out">⏻</button>
          </div>
        )}
      </aside>
      <main className="main-content">
        {hasLuminate && <FilterBar filters={filters} onChange={setFilters} />}
        {active === 'overview' && (kpis && growth ? <OverviewPanel kpis={kpis} growth={growth} timeline={timeline} distrokid={distrokid} /> : <EmptyState source="Luminate (.xlsx)" label="Streaming" />)}
        {active === 'timeline' && (growth ? <ArtistTimelinePanel timeline={timeline} growth={growth} /> : <EmptyState source="Luminate (.xlsx)" label="Timeline" />)}
        {active === 'releases' && (releases.length > 0 ? <ReleaseTablePanel releases={releases} /> : <EmptyState source="Luminate (.xlsx)" label="Release" />)}
        {active === 'songs' && (songs.length > 0 ? <SongRankingsPanel songs={songs} /> : <EmptyState source="Luminate (.xlsx)" label="Song" />)}
        {active === 'trends' && (songs.length > 0 ? <SongTrendsPanel songs={songs} /> : <EmptyState source="Luminate (.xlsx)" label="Song Trend" />)}
        {active === 'catalog' && (catalog ? <CatalogPanel catalog={catalog} /> : <EmptyState source="Luminate (.xlsx)" label="Catalog" />)}
        {active === 'growth' && (growth && kpis ? <GrowthPanel growth={growth} kpis={kpis} /> : <EmptyState source="Luminate (.xlsx)" label="Growth" />)}
        {active === 'cpm' && <CpmPanel artistId={artistId} entries={revenueEntries} onUpdate={setRevenueEntries} data={data} />}
        {active === 'revenue' && (distrokid ? <RevenuePanel data={distrokid} /> : <EmptyState source="DistroKid (.zip)" label="Revenue" />)}
        {active === 'deal' && (deal && kpis ? <DealPanel deal={deal} kpis={kpis} filters={filters} onChange={setFilters} distrokid={distrokid} manualRevenue={revenueEntries} luminateData={data} /> : <EmptyState source="Luminate (.xlsx)" label="Deal" />)}
        {active === 'geo' && (geoBreakdown && geoSummary?.hasGeoData ? <GeoPanel geoBreakdown={geoBreakdown} geoSummary={geoSummary} activeCpm={deal ? (deal as any).cpm || null : null} /> : <EmptyState source="geo-specific Luminate (.xlsx)" label="Geographic" />)}
      </main>
    </div>
  );
}
