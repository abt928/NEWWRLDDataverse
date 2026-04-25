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
      const dateMatch = row.dateRange.match(/(\d{4})\/(\d{2})/);
      if (dateMatch) {
        const key = `${dateMatch[1]}-${dateMatch[2]}`;
        map.set(key, (map.get(key) || 0) + row.quantity);
      }
    }
    return map;
  }, [data]);

  // Build entry lookup
  const entryMap = useMemo(() => {
    const map = new Map<string, ManualRevenueEntry>();
    for (const e of entries) map.set(e.month, e);
    return map;
  }, [entries]);

  // Blended CPM from entered months only
  const totalRevenue = entries.reduce((s, e) => s + e.amount, 0);
  const totalStreamsForRevenueMonths = entries.reduce((s, e) => s + (monthlyStreams.get(e.month) || 0), 0);
  const blendedCpm = totalStreamsForRevenueMonths > 0 ? (totalRevenue / totalStreamsForRevenueMonths) * 1000 : 0;

  // All months from stream data, sorted
  const allMonths = useMemo(() => {
    return Array.from(monthlyStreams.keys()).sort();
  }, [monthlyStreams]);

  // Total streams across all months
  const totalStreamsAll = useMemo(() => {
    let sum = 0;
    for (const v of monthlyStreams.values()) sum += v;
    return sum;
  }, [monthlyStreams]);

  // Estimated total revenue = actual entered + estimated for untracked months
  const estimatedTotalRevenue = useMemo(() => {
    if (blendedCpm === 0) return 0;
    let total = 0;
    for (const month of allMonths) {
      const entry = entryMap.get(month);
      if (entry) {
        total += entry.amount; // Use actual
      } else {
        const streams = monthlyStreams.get(month) || 0;
        total += (streams * blendedCpm) / 1000; // Estimate
      }
    }
    return total;
  }, [blendedCpm, allMonths, entryMap, monthlyStreams]);

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
      <p className="panel-subtitle">Enter payouts for any months you know — the blended CPM is applied across all other months to estimate total revenue.</p>

      {/* Summary KPIs */}
      <div className="cpm-kpis">
        <div className="cpm-kpi cpm-kpi-highlight">
          <span className="cpm-kpi-value">{formatMoney(blendedCpm)}</span>
          <span className="cpm-kpi-label">Blended CPM</span>
        </div>
        <div className="cpm-kpi">
          <span className="cpm-kpi-value">{formatMoney(estimatedTotalRevenue)}</span>
          <span className="cpm-kpi-label">Est. Total Revenue</span>
        </div>
        <div className="cpm-kpi">
          <span className="cpm-kpi-value">{formatMoney(totalRevenue)}</span>
          <span className="cpm-kpi-label">Confirmed Revenue</span>
        </div>
        <div className="cpm-kpi">
          <span className="cpm-kpi-value">{totalStreamsAll.toLocaleString()}</span>
          <span className="cpm-kpi-label">Total Streams</span>
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

      {/* Full Monthly Breakdown */}
      {allMonths.length > 0 && (
        <div className="cpm-table-wrap">
          <table className="cpm-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Streams</th>
                <th>Revenue</th>
                <th>CPM</th>
                <th>Source</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {allMonths.map((month) => {
                const streams = monthlyStreams.get(month) || 0;
                const entry = entryMap.get(month);
                const isActual = !!entry;
                const revenue = isActual ? entry.amount : (blendedCpm > 0 ? (streams * blendedCpm) / 1000 : 0);
                const cpm = streams > 0 ? (revenue / streams) * 1000 : 0;
                return (
                  <tr key={month} className={isActual ? 'cpm-row-actual' : 'cpm-row-estimated'}>
                    <td className="cpm-month">{getMonthLabel(month)}</td>
                    <td className="cpm-streams">{streams.toLocaleString()}</td>
                    <td className="cpm-amount">{formatMoney(revenue)}{!isActual && blendedCpm > 0 && <span className="cpm-est-badge">est</span>}</td>
                    <td className="cpm-cpm">{streams > 0 ? formatMoney(cpm) : '—'}</td>
                    <td className="cpm-note">{isActual ? (entry.note || 'Manual entry') : (blendedCpm > 0 ? 'Estimated from CPM' : '—')}</td>
                    <td>
                      {isActual && <button className="cpm-delete" onClick={() => handleDelete(month)} title="Remove">✕</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="cpm-row-total">
                <td className="cpm-month">Total</td>
                <td className="cpm-streams">{totalStreamsAll.toLocaleString()}</td>
                <td className="cpm-amount">{formatMoney(estimatedTotalRevenue)}</td>
                <td className="cpm-cpm">{formatMoney(blendedCpm)}</td>
                <td className="cpm-note">{entries.length} of {allMonths.length} months confirmed</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {allMonths.length === 0 && (
        <div className="cpm-empty">
          <p>Upload a Luminate file first to see monthly stream data, then enter your payouts to calculate CPM.</p>
        </div>
      )}
    </div>
  );
}
