'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { parseLuminateWorkbook } from '@/lib/parser';
import { parseDistroKidZip } from '@/lib/distrokid-parser';
import type { LuminateDataset, DistroKidDataset } from '@/lib/types';
import Dashboard from '@/components/Dashboard';

interface ArtistCard {
  id: string;
  name: string;
  genre: string;
  atd: number;
  ytd: number;
  currentWeek: number;
  wowChange: number;
  avg12w: number;
  songCount: number;
  releaseCount: number;
  sparkline: number[];
  lastUpdated: string;
  luminateUploadedAt?: string | null;
  distrokidUploadedAt?: string | null;
}

function formatNum(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

function Sparkline({ data }: { data: number[] }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const w = 80, h = 28;
  const pts = data.map((v, i) => `${(i / Math.max(data.length - 1, 1)) * w},${h - (v / max) * h}`).join(' ');
  return <svg width={w} height={h} className="sparkline-svg"><polyline points={pts} fill="none" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" /></svg>;
}

// Toast component
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);
  return <div className={`toast ${type}`}>{message}</div>;
}

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [artists, setArtists] = useState<ArtistCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [dragOver, setDragOver] = useState<'luminate' | 'distrokid' | null>(null);
  const [toasts, setToasts] = useState<{ id: number; message: string; type: 'success' | 'error' }[]>([]);

  // Multi-source upload state
  const [luminateFile, setLuminateFile] = useState<LuminateDataset | null>(null);
  const [distrokidFile, setDistrokidFile] = useState<DistroKidDataset | null>(null);
  const [luminateStatus, setLuminateStatus] = useState<string | null>(null);
  const [distrokidStatus, setDistrokidStatus] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);

  // Dashboard mode
  const [showDashboard, setShowDashboard] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  const addToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const fetchArtists = useCallback(async () => {
    try {
      const res = await fetch('/api/artists');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setArtists(data);
      }
    } catch { /* DB not available */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (status === 'authenticated') fetchArtists();
  }, [fetchArtists, status]);

  const handleLuminateFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setLuminateStatus('⚠ Please upload a .xlsx file');
      return;
    }
    setParsing(true);
    setLuminateStatus('Parsing Luminate spreadsheet…');
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseLuminateWorkbook(buffer);
      setLuminateFile(parsed);
      setLuminateStatus(`✓ ${parsed.summary.reportName} — ${parsed.songWeekly.length.toLocaleString()} song rows`);
    } catch (err) {
      setLuminateStatus(`✗ Parse failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    setParsing(false);
  }, []);

  const handleDistroKidFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      setDistrokidStatus('⚠ Please upload a .zip file');
      return;
    }
    setParsing(true);
    setDistrokidStatus('Extracting ZIP archives…');
    try {
      const buffer = await file.arrayBuffer();
      const parsed = await parseDistroKidZip(buffer);
      setDistrokidFile(parsed);
      setDistrokidStatus(`✓ ${parsed.artistName} — $${parsed.totalEarnings.toLocaleString(undefined, { minimumFractionDigits: 2 })} across ${parsed.monthlyRevenue.length} months`);
    } catch (err) {
      setDistrokidStatus(`✗ Parse failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    setParsing(false);
  }, []);

  const handleContinue = useCallback(async () => {
    setParsing(true);

    // Auto-persist Luminate data
    if (luminateFile) {
      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(luminateFile),
        });
        if (res.ok) {
          addToast('Luminate data saved successfully', 'success');
          await fetchArtists();
        }
      } catch {
        addToast('Luminate data loaded (local only — DB unavailable)', 'error');
      }
    }

    // Auto-persist DistroKid data
    if (distrokidFile) {
      try {
        const entries = (distrokidFile.rawEntries || []).map((e) => ({
          saleMonth: e.saleMonth,
          store: e.store,
          artist: e.artist,
          title: e.title,
          isrc: e.isrc,
          country: e.country,
          quantity: e.quantity,
          earnings: e.earnings,
        }));
        const res = await fetch('/api/upload/distrokid', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entries, artistName: distrokidFile.artistName }),
        });
        if (res.ok) {
          addToast('DistroKid data saved successfully', 'success');
          await fetchArtists();
        } else {
          addToast('DistroKid upload failed', 'error');
        }
      } catch {
        addToast('DistroKid data loaded (local only)', 'error');
      }
    }

    setParsing(false);
    setShowUpload(false);
    setShowDashboard(true);
  }, [luminateFile, distrokidFile, fetchArtists, addToast]);

  // Loading state
  if (status === 'loading') {
    return <div className="home-page"><div className="home-loading"><div className="spinner" /><p>Loading…</p></div></div>;
  }

  // Dashboard view
  if (showDashboard && (luminateFile || distrokidFile)) {
    return (
      <Dashboard
        data={luminateFile || undefined}
        distrokid={distrokidFile || undefined}
        onReset={() => {
          setShowDashboard(false);
          setLuminateFile(null);
          setDistrokidFile(null);
          setLuminateStatus(null);
          setDistrokidStatus(null);
        }}
      />
    );
  }

  const filtered = artists.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.genre.toLowerCase().includes(search.toLowerCase())
  );

  const canContinue = luminateFile || distrokidFile;

  return (
    <div className="home-page">
      <header className="home-header">
        <div className="home-brand">
          <h1>NEWWRLD <span className="auth-brand-sub">DATAVERSE</span></h1>
          <p>Streaming data intelligence for artist acquisition & management</p>
        </div>
        <div className="home-actions">
          <button className="btn-primary" onClick={() => setShowUpload(true)}>+ Upload Data</button>
          {session?.user && (
            <button className="btn-secondary" onClick={() => signOut()} title="Sign out">
              ⏻
            </button>
          )}
        </div>
      </header>

      <div className="home-search-bar">
        <input type="text" placeholder="Search artists…" value={search} onChange={(e) => setSearch(e.target.value)} className="home-search" aria-label="Search artists" />
        <span className="home-count">{filtered.length} artist{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div className="home-loading"><div className="spinner" /><p>Loading artists…</p></div>
      ) : filtered.length === 0 && !search ? (
        <div className="home-empty">
          <div className="home-empty-icon">📊</div>
          <h3>No reports yet</h3>
          <p>Upload Luminate or DistroKid data to get started</p>
          <button className="btn-primary" onClick={() => setShowUpload(true)}>Upload Data</button>
        </div>
      ) : (
        <div className="artist-grid">
          {filtered.map((a) => (
            <div key={a.id} className="artist-card" onClick={() => window.location.href = `/artist/${a.id}`}>
              <div className="card-top">
                <div>
                  <h3 className="card-name">{a.name}</h3>
                  <span className="card-genre">{a.genre || 'Music'}</span>
                </div>
                <Sparkline data={a.sparkline} />
              </div>
              <div className="card-stats">
                <div className="card-stat">
                  <span className="card-stat-value">{formatNum(a.atd)}</span>
                  <span className="card-stat-label">ATD</span>
                </div>
                <div className="card-stat">
                  <span className="card-stat-value">{formatNum(a.currentWeek)}</span>
                  <span className="card-stat-label">This Week</span>
                </div>
                <div className="card-stat">
                  <span className={`card-stat-value ${a.wowChange > 0 ? 'trend-up' : a.wowChange < 0 ? 'trend-down' : ''}`}>
                    {a.wowChange > 0 ? '+' : ''}{a.wowChange}%
                  </span>
                  <span className="card-stat-label">WoW</span>
                </div>
              </div>
              <div className="card-footer">
                <span>{a.songCount} songs · {a.releaseCount} releases</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Multi-Source Upload Modal */}
      {showUpload && (
        <div className="modal-overlay" onClick={() => !parsing && setShowUpload(false)}>
          <div className="modal upload-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Upload Data Sources</h3>
                <p className="modal-subtitle">Add one or both — each source enriches your analysis</p>
              </div>
              <button className="modal-close" onClick={() => !parsing && setShowUpload(false)}>✕</button>
            </div>

            <div className="upload-sources">
              <div
                className={`upload-zone ${luminateFile ? 'done' : ''} ${dragOver === 'luminate' ? 'drag-over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver('luminate'); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => { e.preventDefault(); setDragOver(null); const f = e.dataTransfer.files[0]; if (f) handleLuminateFile(f); }}
                onClick={() => document.getElementById('luminate-input')?.click()}
              >
                <div className="upload-zone-icon">{luminateFile ? '✓' : '📊'}</div>
                <div className="upload-zone-title">Luminate .xlsx</div>
                <div className="upload-zone-desc">{luminateStatus || 'Weekly streaming data, catalog, and chart performance'}</div>
                <input id="luminate-input" type="file" accept=".xlsx,.xls" aria-label="Upload Luminate file" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLuminateFile(f); }} />
              </div>

              <div
                className={`upload-zone ${distrokidFile ? 'done' : ''} ${dragOver === 'distrokid' ? 'drag-over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver('distrokid'); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => { e.preventDefault(); setDragOver(null); const f = e.dataTransfer.files[0]; if (f) handleDistroKidFile(f); }}
                onClick={() => document.getElementById('distrokid-input')?.click()}
              >
                <div className="upload-zone-icon">{distrokidFile ? '✓' : '📦'}</div>
                <div className="upload-zone-title">DistroKid .zip</div>
                <div className="upload-zone-desc">{distrokidStatus || 'Exact revenue per stream, platform & country breakdowns'}</div>
                <input id="distrokid-input" type="file" accept=".zip" aria-label="Upload DistroKid file" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDistroKidFile(f); }} />
              </div>
            </div>

            {parsing && <div className="upload-parsing"><div className="spinner" /><span>Processing…</span></div>}

            <div className="upload-actions">
              <button className={`btn-primary upload-continue ${canContinue ? '' : 'disabled'}`} disabled={!canContinue || parsing} onClick={handleContinue}>
                {canContinue
                  ? `Continue to Dashboard${luminateFile && distrokidFile ? ' (Both Sources)' : luminateFile ? ' (Luminate)' : ' (DistroKid)'} →`
                  : 'Upload at least one data source to continue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map((t) => (
            <Toast key={t.id} message={t.message} type={t.type} onClose={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))} />
          ))}
        </div>
      )}
    </div>
  );
}
