'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
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
  distrokidCount: number;
  sparkline: number[];
  lastUpdated: string;
  luminateUploadedAt?: string | null;
  distrokidUploadedAt?: string | null;
  pipelineStage?: string;
  hasQBR?: boolean;
  hasTrends?: boolean;
  hasGeo?: boolean;
  hasDK?: boolean;
}

const STAGE_OPTIONS = [
  { id: 'research', label: 'Research', color: '#818cf8' },
  { id: 'review', label: 'Under Review', color: '#22d3ee' },
  { id: 'negotiation', label: 'In Negotiation', color: '#f59e0b' },
  { id: 'closed', label: 'Closed', color: '#10b981' },
] as const;

/** Weighted data completeness: QBR=25, Trends=25, DK=30, Geo=20 = 100 */
function computeDataScore(a: ArtistCard): { score: number; segments: { key: string; label: string; weight: number; active: boolean }[] } {
  const segments = [
    { key: 'qbr', label: 'Luminate QBR', weight: 25, active: !!a.hasQBR },
    { key: 'trends', label: 'Activity Trends', weight: 25, active: !!a.hasTrends },
    { key: 'dk', label: 'DistroKid', weight: 30, active: !!a.hasDK },
    { key: 'geo', label: 'Geo Detail', weight: 20, active: !!a.hasGeo },
  ];
  const score = segments.reduce((s, seg) => s + (seg.active ? seg.weight : 0), 0);
  return { score, segments };
}

interface QueuedFile {
  id: number;
  name: string;
  type: 'luminate' | 'distrokid';
  status: 'ready' | 'saving' | 'saved' | 'error';
  error?: string;
  rawFile: File;
}

function formatNum(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function ConfirmModal({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
        <p>{message}</p>
        <div className="confirm-actions">
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn-danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}

function Sparkline({ data }: { data: number[] }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const w = 80, h = 28;
  const pts = data.map((v, i) => `${(i / Math.max(data.length - 1, 1)) * w},${h - (v / max) * h}`).join(' ');
  return <svg width={w} height={h} className="sparkline-svg"><polyline points={pts} fill="none" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" /></svg>;
}

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
  const [deleteTarget, setDeleteTarget] = useState<ArtistCard | null>(null);
  const [search, setSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; message: string; type: 'success' | 'error' }[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'pipeline'>('grid');

  // Bulk upload queue — stores raw File objects
  const [fileQueue, setFileQueue] = useState<QueuedFile[]>([]);
  const [saving, setSaving] = useState(false);

  // Single artist drill-down
  const [activeDashboard, setActiveDashboard] = useState<{ luminate?: LuminateDataset; distrokid?: DistroKidDataset } | null>(null);

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

  // Add files to queue (no parsing — just validate extension)
  const handleFiles = useCallback((files: FileList) => {
    const newFiles: QueuedFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isLuminate = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
      const isDistroKid = file.name.endsWith('.zip');
      if (!isLuminate && !isDistroKid) continue;

      newFiles.push({
        id: Date.now() + Math.random(),
        name: file.name,
        type: isLuminate ? 'luminate' : 'distrokid',
        status: 'ready',
        rawFile: file,
      });
    }
    setFileQueue((prev) => [...prev, ...newFiles]);
  }, []);

  // Upload all files — DistroKid parsed client-side in batches, Luminate as raw file
  const handleSaveAll = useCallback(async () => {
    setSaving(true);
    const readyFiles = fileQueue.filter((f) => f.status === 'ready');
    let savedCount = 0;

    for (const file of readyFiles) {
      setFileQueue((prev) =>
        prev.map((f) => f.id === file.id ? { ...f, status: 'saving' as const } : f)
      );

      try {
        if (file.type === 'distrokid') {
          // Client-side: unzip → parse CSVs → send entries in batches
          const { parseDistroKidZip } = await import('@/lib/distrokid-parser');
          const buffer = await file.rawFile.arrayBuffer();
          const parsed = await parseDistroKidZip(buffer);
          const rawEntries = parsed.rawEntries || [];

          // Send in batches of 500 entries
          const BATCH_SIZE = 500;
          let totalUpserted = 0;
          for (let i = 0; i < rawEntries.length; i += BATCH_SIZE) {
            const batch = rawEntries.slice(i, i + BATCH_SIZE).map((e) => ({
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
              body: JSON.stringify({ entries: batch, artistName: parsed.artistName }),
            });
            if (res.ok) {
              const result = await res.json();
              totalUpserted += result.rowsProcessed || 0;
            }
          }

          setFileQueue((prev) =>
            prev.map((f) => f.id === file.id ? { ...f, status: 'saved' as const } : f)
          );
          savedCount++;
        } else {
          // Luminate: send raw file via FormData
          const formData = new FormData();
          formData.append('file', file.rawFile);
          formData.append('type', 'luminate');

          const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });

          if (res.ok) {
            setFileQueue((prev) =>
              prev.map((f) => f.id === file.id ? { ...f, status: 'saved' as const } : f)
            );
            savedCount++;
          } else {
            let errMsg = 'Upload failed';
            try {
              const err = await res.json();
              errMsg = err.error || errMsg;
            } catch {
              errMsg = `Server error (${res.status})`;
            }
            throw new Error(errMsg);
          }
        }
      } catch (err) {
        setFileQueue((prev) =>
          prev.map((f) => f.id === file.id ? { ...f, status: 'error' as const, error: err instanceof Error ? err.message : 'Save failed' } : f)
        );
      }
    }

    if (savedCount > 0) {
      addToast(`${savedCount} file${savedCount > 1 ? 's' : ''} saved to database`, 'success');
      await fetchArtists();
    }

    setSaving(false);
    setTimeout(() => {
      setShowUpload(false);
      setFileQueue([]);
    }, 1000);
  }, [fileQueue, fetchArtists, addToast]);

  const removeFile = useCallback((id: number) => {
    setFileQueue((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // Loading state
  if (status === 'loading') {
    return <div className="home-page"><div className="home-loading"><div className="spinner" /><p>Loading…</p></div></div>;
  }

  // Dashboard drill-down view
  if (activeDashboard) {
    return (
      <Dashboard
        data={activeDashboard.luminate}
        distrokid={activeDashboard.distrokid}
        onReset={() => setActiveDashboard(null)}
      />
    );
  }

  const filtered = artists.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.genre.toLowerCase().includes(search.toLowerCase())
  );

  const readyCount = fileQueue.filter((f) => f.status === 'ready').length;
  const allDone = fileQueue.length > 0 && fileQueue.every((f) => f.status === 'saved' || f.status === 'error');

  const statusIcon = (s: QueuedFile['status']) => {
    switch (s) {
      case 'ready': return '✓';
      case 'saving': return '↑';
      case 'saved': return '✔';
      case 'error': return '✗';
    }
  };

  return (
    <div className="home-page">
      <header className="home-header">
        <div className="home-brand">
            <h1><span className="brand-shimmer">NEWWRLD</span> <span className="auth-brand-sub">DATAVERSE</span></h1>
          <p>Streaming data intelligence for artist acquisition & management</p>
        </div>
        <div className="home-actions">
          <button className="btn-primary" onClick={() => setShowUpload(true)}>+ Upload Data</button>
          <div className="home-view-toggle">
            <button className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')}>Grid</button>
            <button className={`view-toggle-btn ${viewMode === 'pipeline' ? 'active' : ''}`} onClick={() => setViewMode('pipeline')}>Pipeline</button>
          </div>
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
          <div className="home-empty-icon" aria-hidden="true">—</div>
          <h3>Start Your First Analysis</h3>
          <p>Drop Luminate or DistroKid files here to build streaming intelligence dashboards instantly</p>
          <button className="btn-primary" onClick={() => setShowUpload(true)}>Upload Data</button>
        </div>
      ) : viewMode === 'pipeline' ? (
        <PipelineBoard artists={filtered} onStageChange={(id, stage) => {
          setArtists(prev => prev.map(a => a.id === id ? { ...a, pipelineStage: stage } : a));
          fetch(`/api/artists/${id}/stage`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stage }),
          });
        }} />
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
              <DataBar artist={a} />
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
                <StageDropdown
                  stage={a.pipelineStage || 'research'}
                  onChange={(stage) => {
                    setArtists(prev => prev.map(x => x.id === a.id ? { ...x, pipelineStage: stage } : x));
                    fetch(`/api/artists/${a.id}/stage`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ stage }),
                    });
                  }}
                />
              </div>
              <button
                className="card-delete-btn"
                title="Delete artist"
                onClick={(e) => { e.stopPropagation(); setDeleteTarget(a); }}
              >✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Bulk Upload Modal */}
      {showUpload && (
        <div className="modal-overlay" onClick={() => !saving && setShowUpload(false)}>
          <div className="modal upload-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Upload Data Sources</h3>
                <p className="modal-subtitle">Drop all your files — Luminate (.xlsx) and DistroKid (.zip). Files are sent directly to the server.</p>
              </div>
              <button className="modal-close" onClick={() => !saving && setShowUpload(false)}>✕</button>
            </div>

            <div
              className="upload-dropzone"
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
              onDragLeave={(e) => { e.currentTarget.classList.remove('drag-over'); }}
              onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('drag-over'); handleFiles(e.dataTransfer.files); }}
              onClick={() => document.getElementById('bulk-input')?.click()}
            >
              <div className="upload-dropzone-icon" aria-hidden="true">↑</div>
              <div className="upload-dropzone-text">
                Drop files here or <span className="upload-dropzone-link">browse</span>
              </div>
              <div className="upload-dropzone-hint">.xlsx (Luminate) · .zip (DistroKid) · Multiple files supported</div>
              <input
                id="bulk-input"
                type="file"
                accept=".xlsx,.xls,.zip"
                multiple
                aria-label="Upload files"
                onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ''; }}
              />
            </div>

            {fileQueue.length > 0 && (
              <div className="upload-queue">
                {fileQueue.map((f) => (
                  <div key={f.id} className={`upload-queue-item ${f.status}`}>
                    <span className="queue-icon">{statusIcon(f.status)}</span>
                    <span className="queue-name">{f.name}</span>
                    <span className="queue-type">{f.type === 'luminate' ? 'Luminate' : 'DistroKid'}</span>
                    {f.status === 'error' && <span className="queue-error">{f.error}</span>}
                    {f.status !== 'saving' && f.status !== 'saved' && (
                      <button className="queue-remove" onClick={() => removeFile(f.id)}>✕</button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="upload-actions">
              <button
                className={`btn-primary upload-continue ${readyCount > 0 && !saving ? '' : 'disabled'}`}
                disabled={readyCount === 0 || saving}
                onClick={handleSaveAll}
              >
                {saving ? 'Saving…' : allDone ? 'Done!' : readyCount > 0
                  ? `Save ${readyCount} file${readyCount > 1 ? 's' : ''} to Database →`
                  : 'Add files to continue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map((t) => (
            <Toast key={t.id} message={t.message} type={t.type} onClose={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))} />
          ))}
        </div>
      )}

      {deleteTarget && (
        <ConfirmModal
          message={`Delete "${deleteTarget.name}" and all associated data? This cannot be undone.`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={async () => {
            const target = deleteTarget;
            setDeleteTarget(null);
            try {
              const res = await fetch(`/api/artists/${target.id}/delete`, { method: 'DELETE' });
              if (!res.ok) throw new Error('Delete failed');
              addToast(`${target.name} deleted`, 'success');
              await fetchArtists();
            } catch {
              addToast(`Failed to delete ${target.name}`, 'error');
            }
          }}
        />
      )}
    </div>
  );
}

/** Data completeness bar — labeled segments so users know what each piece means */
function DataBar({ artist }: { artist: ArtistCard }) {
  const { score, segments } = computeDataScore(artist);
  const abbrev: Record<string, string> = { qbr: 'QBR', trends: 'ACT', dk: 'DK', geo: 'GEO' };

  return (
    <div className="data-bar-wrap" onClick={(e) => e.stopPropagation()}>
      <span className="data-bar-prefix">Data</span>
      <div className="data-bar-chips">
        {segments.map(seg => (
          <span
            key={seg.key}
            className={`data-bar-chip ${seg.active ? 'active' : ''}`}
            data-segment={seg.key}
            title={`${seg.label}: ${seg.active ? 'Uploaded ✓' : 'Not yet uploaded'}`}
          >
            {abbrev[seg.key]}
          </span>
        ))}
      </div>
      <span className={`data-bar-pct ${score === 100 ? 'complete' : ''}`}>{score}%</span>
    </div>
  );
}

/** Inline stage dropdown for artist cards */
function StageDropdown({ stage, onChange }: { stage: string; onChange: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = STAGE_OPTIONS.find(s => s.id === stage) || STAGE_OPTIONS[0];

  return (
    <div className="stage-dropdown" onClick={(e) => e.stopPropagation()}>
      <button
        className="stage-dropdown-trigger"
        onClick={() => setOpen(!open)}
      >
        <span className="stage-dropdown-dot" data-stage={current.id} />
        <span className="stage-dropdown-label">{current.label}</span>
        <span className="stage-dropdown-arrow">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="stage-dropdown-menu">
          {STAGE_OPTIONS.map(opt => (
            <button
              key={opt.id}
              className={`stage-dropdown-option ${opt.id === stage ? 'active' : ''}`}
              onClick={() => { onChange(opt.id); setOpen(false); }}
            >
              <span className="stage-dropdown-dot" data-stage={opt.id} />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Pipeline / Kanban Board */
const PIPELINE_STAGES = [
  { id: 'research', label: 'Research', emptyText: 'Drag artists here to begin research' },
  { id: 'review', label: 'Under Review', emptyText: 'Artists being reviewed' },
  { id: 'negotiation', label: 'In Negotiation', emptyText: 'Active deal negotiations' },
  { id: 'closed', label: 'Closed', emptyText: 'Completed acquisitions' },
] as const;

function PipelineBoard({ artists, onStageChange }: {
  artists: ArtistCard[];
  onStageChange: (artistId: string, newStage: string) => void;
}) {
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, artistId: string) => {
    e.dataTransfer.setData('text/plain', artistId);
    e.dataTransfer.effectAllowed = 'move';
    setDragId(artistId);
  };

  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCol(stageId);
  };

  const handleDragLeave = () => {
    setDragOverCol(null);
  };

  const handleDrop = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    const artistId = e.dataTransfer.getData('text/plain');
    if (artistId) {
      onStageChange(artistId, stageId);
    }
    setDragOverCol(null);
    setDragId(null);
  };

  return (
    <div className="pipeline-board">
      {PIPELINE_STAGES.map(stage => {
        const stageArtists = artists.filter(a => (a.pipelineStage || 'research') === stage.id);
        return (
          <div
            key={stage.id}
            className={`pipeline-column ${dragOverCol === stage.id ? 'drag-over' : ''}`}
            data-stage={stage.id}
            onDragOver={(e) => handleDragOver(e, stage.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, stage.id)}
          >
            <div className="pipeline-column-header">
              <span className="pipeline-column-title">{stage.label}</span>
              <span className="pipeline-column-count">{stageArtists.length}</span>
            </div>
            <div className="pipeline-cards">
              {stageArtists.length > 0 ? stageArtists.map(a => (
                <div
                  key={a.id}
                  className={`pipeline-card ${dragId === a.id ? 'dragging' : ''}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, a.id)}
                  onDragEnd={() => setDragId(null)}
                >
                  <div className="pipeline-card-name">{a.name}</div>
                  <div className="pipeline-card-genre">{a.genre || 'Music'}</div>
                  <DataBar artist={a} />
                  <div className="pipeline-card-stats">
                    <div className="pipeline-card-stat">
                      <span className="pipeline-card-stat-value">{formatNum(a.atd)}</span>
                      <span className="pipeline-card-stat-label">ATD</span>
                    </div>
                    <div className="pipeline-card-stat">
                      <span className="pipeline-card-stat-value">{formatNum(a.currentWeek)}</span>
                      <span className="pipeline-card-stat-label">Week</span>
                    </div>
                    <div className="pipeline-card-stat">
                      <span className={`pipeline-card-stat-value ${a.wowChange > 0 ? 'trend-up' : a.wowChange < 0 ? 'trend-down' : ''}`}>
                        {a.wowChange > 0 ? '+' : ''}{a.wowChange}%
                      </span>
                      <span className="pipeline-card-stat-label">WoW</span>
                    </div>
                  </div>
                  <a href={`/artist/${a.id}`} className="pipeline-card-click" onClick={(e) => e.stopPropagation()}>
                    View Dashboard →
                  </a>
                </div>
              )) : (
                <div className="pipeline-empty">{stage.emptyText}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
