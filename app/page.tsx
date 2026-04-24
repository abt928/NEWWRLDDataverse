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
  distrokidCount: number;
  sparkline: number[];
  lastUpdated: string;
  luminateUploadedAt?: string | null;
  distrokidUploadedAt?: string | null;
}

interface QueuedFile {
  id: number;
  name: string;
  type: 'luminate' | 'distrokid';
  status: 'parsing' | 'ready' | 'saving' | 'saved' | 'error';
  error?: string;
  luminateData?: LuminateDataset;
  distrokidData?: DistroKidDataset;
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
  const [search, setSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; message: string; type: 'success' | 'error' }[]>([]);

  // Bulk upload queue
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

  // Parse a single file and add to queue
  const processFile = useCallback(async (file: File) => {
    const id = Date.now() + Math.random();
    const isLuminate = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const isDistroKid = file.name.endsWith('.zip');

    if (!isLuminate && !isDistroKid) return;

    const queueItem: QueuedFile = {
      id,
      name: file.name,
      type: isLuminate ? 'luminate' : 'distrokid',
      status: 'parsing',
    };
    setFileQueue((prev) => [...prev, queueItem]);

    try {
      const buffer = await file.arrayBuffer();
      if (isLuminate) {
        const parsed = parseLuminateWorkbook(buffer);
        setFileQueue((prev) =>
          prev.map((f) => f.id === id ? { ...f, status: 'ready' as const, luminateData: parsed } : f)
        );
      } else {
        const parsed = await parseDistroKidZip(buffer);
        setFileQueue((prev) =>
          prev.map((f) => f.id === id ? { ...f, status: 'ready' as const, distrokidData: parsed } : f)
        );
      }
    } catch (err) {
      setFileQueue((prev) =>
        prev.map((f) => f.id === id ? { ...f, status: 'error' as const, error: err instanceof Error ? err.message : 'Parse failed' } : f)
      );
    }
  }, []);

  // Handle file input (supports multiple)
  const handleFiles = useCallback(async (files: FileList) => {
    for (let i = 0; i < files.length; i++) {
      await processFile(files[i]);
    }
  }, [processFile]);

  // Save all ready files to DB
  const handleSaveAll = useCallback(async () => {
    setSaving(true);
    const readyFiles = fileQueue.filter((f) => f.status === 'ready');
    let savedCount = 0;

    for (const file of readyFiles) {
      setFileQueue((prev) =>
        prev.map((f) => f.id === file.id ? { ...f, status: 'saving' as const } : f)
      );

      try {
        if (file.type === 'luminate' && file.luminateData) {
          const res = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(file.luminateData),
          });
          if (res.ok) {
            setFileQueue((prev) =>
              prev.map((f) => f.id === file.id ? { ...f, status: 'saved' as const } : f)
            );
            savedCount++;
          } else {
            const err = await res.json();
            throw new Error(err.error || 'Upload failed');
          }
        } else if (file.type === 'distrokid' && file.distrokidData) {
          const entries = (file.distrokidData.rawEntries || []).map((e) => ({
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
            body: JSON.stringify({ entries, artistName: file.distrokidData.artistName }),
          });
          if (res.ok) {
            setFileQueue((prev) =>
              prev.map((f) => f.id === file.id ? { ...f, status: 'saved' as const } : f)
            );
            savedCount++;
          } else {
            const err = await res.json();
            throw new Error(err.error || 'Upload failed');
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
    // Close modal after a beat
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
      case 'parsing': return '⏳';
      case 'ready': return '✓';
      case 'saving': return '📤';
      case 'saved': return '✅';
      case 'error': return '✗';
    }
  };

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
          <p>Upload Luminate or DistroKid files to get started — you can drop multiple files at once</p>
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
                <span className="card-sources">
                  {a.luminateUploadedAt && <span className="card-source" title={`Luminate — ${timeAgo(a.luminateUploadedAt)}`}>📊 {timeAgo(a.luminateUploadedAt)}</span>}
                  {a.distrokidUploadedAt && <span className="card-source" title={`DistroKid — ${timeAgo(a.distrokidUploadedAt)}`}>📦 {timeAgo(a.distrokidUploadedAt)}</span>}
                </span>
              </div>
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
                <p className="modal-subtitle">Drop all your files — Luminate (.xlsx) and DistroKid (.zip). We'll handle the rest.</p>
              </div>
              <button className="modal-close" onClick={() => !saving && setShowUpload(false)}>✕</button>
            </div>

            {/* Drop zone */}
            <div
              className="upload-dropzone"
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
              onDragLeave={(e) => { e.currentTarget.classList.remove('drag-over'); }}
              onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('drag-over'); handleFiles(e.dataTransfer.files); }}
              onClick={() => document.getElementById('bulk-input')?.click()}
            >
              <div className="upload-dropzone-icon">📁</div>
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

            {/* File queue */}
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
