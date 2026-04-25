'use client';

import { useState, useMemo } from 'react';
import type { LuminateDataset } from '@/lib/types';

interface ManualRevenueEntry {
  id: string;
  month: string;
  amount: number;
  note: string;
}

interface CpmPanelProps {
  artistId?: string;
  entries: ManualRevenueEntry[];
  onUpdate: (entries: ManualRevenueEntry[]) => void;
  data?: LuminateDataset;
}

function formatMoney(n: number): string {
  return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getMonthLabel(m: string): string {
  const [year, month] = m.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(month) - 1]} ${year}`;
}

export default function CpmPanel({ artistId, entries, onUpdate, data }: CpmPanelProps) {
  const [newMonth, setNewMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [newAmount, setNewAmount] = useState('');
  const [newNote, setNewNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Compute streams per month from Luminate weekly data
  const monthlyStreams = useMemo(() => {
    if (!data?.artistWeekly?.length) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const row of data.artistWeekly) {
      // Parse dateRange like "2025/05/23 - 2025/05/29" to get month
      const dateMatch = row.dateRange.match(/(\d{4})\/(\d{2})/);
      if (dateMatch) {
        const key = `${dateMatch[1]}-${dateMatch[2]}`;
        map.set(key, (map.get(key) || 0) + row.quantity);
      }
    }
    return map;
  }, [data]);

  // Total revenue and streams
  const totalRevenue = entries.reduce((s, e) => s + e.amount, 0);
  const totalStreamsForRevenueMonths = entries.reduce((s, e) => s + (monthlyStreams.get(e.month) || 0), 0);
  const overallCpm = totalStreamsForRevenueMonths > 0 ? (totalRevenue / totalStreamsForRevenueMonths) * 1000 : 0;

  const handleSave = async () => {
    if (!artistId || !newAmount) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/artists/${artistId}/revenue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: newMonth, amount: parseFloat(newAmount), note: newNote }),
      });
      if (!res.ok) throw new Error('Save failed');
      const entry: ManualRevenueEntry = await res.json();
      const updated = entries.filter(e => e.month !== entry.month);
      updated.push(entry);
      updated.sort((a, b) => b.month.localeCompare(a.month));
      onUpdate(updated);
      setNewAmount('');
      setNewNote('');
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  };

  const handleDelete = async (month: string) => {
    if (!artistId) return;
    try {
      await fetch(`/api/artists/${artistId}/revenue`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      });
      onUpdate(entries.filter(e => e.month !== month));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="panel">
      <h2 className="panel-title">🧮 CPM Calculator</h2>
      <p className="panel-subtitle">Enter monthly payout amounts to calculate your actual CPM (revenue per 1,000 streams)</p>

      {/* Summary KPIs */}
      <div className="cpm-kpis">
        <div className="cpm-kpi">
          <span className="cpm-kpi-value">{formatMoney(overallCpm)}</span>
          <span className="cpm-kpi-label">Blended CPM</span>
        </div>
        <div className="cpm-kpi">
          <span className="cpm-kpi-value">{formatMoney(totalRevenue)}</span>
          <span className="cpm-kpi-label">Total Revenue Entered</span>
        </div>
        <div className="cpm-kpi">
          <span className="cpm-kpi-value">{totalStreamsForRevenueMonths.toLocaleString()}</span>
          <span className="cpm-kpi-label">Matched Streams</span>
        </div>
        <div className="cpm-kpi">
          <span className="cpm-kpi-value">{entries.length}</span>
          <span className="cpm-kpi-label">Months Tracked</span>
        </div>
      </div>

      {/* Add Entry Form */}
      <div className="cpm-form">
        <h3>Add Monthly Revenue</h3>
        <div className="cpm-form-row">
          <div className="cpm-field">
            <label>Month</label>
            <input type="month" value={newMonth} onChange={(e) => setNewMonth(e.target.value)} />
          </div>
          <div className="cpm-field">
            <label>Payout Amount ($)</label>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
            />
          </div>
          <div className="cpm-field cpm-field-note">
            <label>Note (optional)</label>
            <input
              type="text"
              placeholder="e.g., DistroKid payout"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
            />
          </div>
          <button className="btn-primary cpm-save-btn" onClick={handleSave} disabled={saving || !newAmount}>
            {saving ? 'Saving…' : '+ Add'}
          </button>
        </div>
      </div>

      {/* Entries Table */}
      {entries.length > 0 && (
        <div className="cpm-table-wrap">
          <table className="cpm-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Revenue</th>
                <th>Streams</th>
                <th>CPM</th>
                <th>Note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const streams = monthlyStreams.get(entry.month) || 0;
                const cpm = streams > 0 ? (entry.amount / streams) * 1000 : 0;
                return (
                  <tr key={entry.id}>
                    <td className="cpm-month">{getMonthLabel(entry.month)}</td>
                    <td className="cpm-amount">{formatMoney(entry.amount)}</td>
                    <td className="cpm-streams">{streams > 0 ? streams.toLocaleString() : '—'}</td>
                    <td className="cpm-cpm">{streams > 0 ? formatMoney(cpm) : '—'}</td>
                    <td className="cpm-note">{entry.note}</td>
                    <td>
                      <button className="cpm-delete" onClick={() => handleDelete(entry.month)} title="Remove">✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {entries.length === 0 && (
        <div className="cpm-empty">
          <p>No revenue entries yet. Add your first monthly payout above to start tracking CPM.</p>
        </div>
      )}
    </div>
  );
}
