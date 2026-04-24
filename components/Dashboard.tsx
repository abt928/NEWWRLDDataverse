'use client';
import { useState, useMemo, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
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
import FilterBar from './FilterBar';

interface NavItem {
  id: string;
  label: string;
  icon: string;
  requiresLuminate?: boolean;
  requiresDistroKid?: boolean;
}

const ALL_NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: '📊', requiresLuminate: true },
  { id: 'timeline', label: 'Artist Timeline', icon: '📈', requiresLuminate: true },
  { id: 'releases', label: 'Releases', icon: '💿', requiresLuminate: true },
  { id: 'songs', label: 'Song Rankings', icon: '🎵', requiresLuminate: true },
  { id: 'trends', label: 'Song Trends', icon: '📉', requiresLuminate: true },
  { id: 'catalog', label: 'Catalog Mix', icon: '🎯', requiresLuminate: true },
  { id: 'growth', label: 'Growth Metrics', icon: '🚀', requiresLuminate: true },
  { id: 'revenue', label: 'Revenue & Platforms', icon: '💵', requiresDistroKid: true },
  { id: 'deal', label: 'Deal Intelligence', icon: '💰', requiresLuminate: true },
];

interface DashboardProps {
  data?: LuminateDataset;
  distrokid?: DistroKidDataset;
  onReset: () => void;
  artistId?: string;
  luminateUploadedAt?: string | null;
  distrokidUploadedAt?: string | null;
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

export default function Dashboard({ data, distrokid, onReset, artistId, luminateUploadedAt, distrokidUploadedAt }: DashboardProps) {
  const { data: session } = useSession();
  const hasLuminate = !!data;
  const hasDistroKid = !!distrokid;

  const navItems = useMemo(() => ALL_NAV_ITEMS.filter((item) => {
    if (item.requiresLuminate && !hasLuminate) return false;
    if (item.requiresDistroKid && !hasDistroKid) return false;
    return true;
  }), [hasLuminate, hasDistroKid]);

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

  const shareUrl = artistId ? `${window.location.origin}/share/${artistId}` : null;

  const handleShare = useCallback(async () => {
    if (!artistId) return;
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistId }),
      });
      const data = await res.json();
      if (data.url) {
        await navigator.clipboard.writeText(data.url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Fallback to simple URL copy
      if (shareUrl) {
        navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  }, [artistId, shareUrl]);

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
          {hasLuminate && hasDistroKid && (
            <div className="data-sources-badge">
              <span className="source-dot luminate" />Luminate
              <span className="source-dot distrokid" />DistroKid
            </div>
          )}
        </div>
        <ul className="sidebar-nav">
          {navItems.map((item) => (
            <li key={item.id}>
              <button className={active === item.id ? 'active' : ''} onClick={() => setActive(item.id)}>
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

        {/* Upload Status */}
        <div className="sidebar-upload-status">
          <div className="upload-status-item">
            <span className="status-icon">📊</span>
            Luminate —{' '}
            <span className="status-date">
              {luminateUploadedAt ? timeAgo(luminateUploadedAt) : 'Not uploaded'}
            </span>
          </div>
          <div className="upload-status-item">
            <span className="status-icon">📦</span>
            DistroKid —{' '}
            <span className="status-date">
              {distrokidUploadedAt ? timeAgo(distrokidUploadedAt) : 'Not uploaded'}
            </span>
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
            <button className="sidebar-signout" onClick={() => signOut()} title="Sign out">⏻</button>
          </div>
        )}
      </aside>
      <main className="main-content">
        {hasLuminate && <FilterBar filters={filters} onChange={setFilters} />}
        {active === 'overview' && kpis && growth && <OverviewPanel kpis={kpis} growth={growth} timeline={timeline} distrokid={distrokid} />}
        {active === 'timeline' && growth && <ArtistTimelinePanel timeline={timeline} growth={growth} />}
        {active === 'releases' && <ReleaseTablePanel releases={releases} />}
        {active === 'songs' && <SongRankingsPanel songs={songs} />}
        {active === 'trends' && <SongTrendsPanel songs={songs} />}
        {active === 'catalog' && catalog && <CatalogPanel catalog={catalog} />}
        {active === 'growth' && growth && kpis && <GrowthPanel growth={growth} kpis={kpis} />}
        {active === 'revenue' && distrokid && <RevenuePanel data={distrokid} />}
        {active === 'deal' && deal && kpis && <DealPanel deal={deal} kpis={kpis} filters={filters} onChange={setFilters} distrokid={distrokid} />}
      </main>
    </div>
  );
}
