'use client';

import { useState, useMemo } from 'react';
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
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

function formatCompact(n: number): string {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return '$' + (n / 1_000).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
}

function formatStreams(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

function getMonthLabel(m: string): string {
  const [year, month] = m.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(month) - 1]} ${year}`;
}

function getShortLabel(m: string): string {
  const [year, month] = m.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(month) - 1]} '${year.slice(2)}`;
}

export default function CpmPanel({ artistId, entries, onUpdate, data }: CpmPanelProps) {
  const [newMonth, setNewMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [newAmount, setNewAmount] = useState('');
  const [newNote, setNewNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingMonth, setEditingMonth] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

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

  // Chart data + estimated total revenue
  const { chartData, estimatedTotalRevenue } = useMemo(() => {
    let estTotal = 0;
    const chart = allMonths.map((month) => {
      const streams = monthlyStreams.get(month) || 0;
      const entry = entryMap.get(month);
      const isActual = !!entry;
      const revenue = isActual ? entry.amount : (blendedCpm > 0 ? (streams * blendedCpm) / 1000 : 0);
      estTotal += revenue;
      return {
        month: getShortLabel(month),
        monthKey: month,
        streams,
        revenue: Math.round(revenue * 100) / 100,
        actualRevenue: isActual ? entry.amount : 0,
        estimatedRevenue: isActual ? 0 : Math.round(revenue * 100) / 100,
        isActual,
      };
    });
    return { chartData: chart, estimatedTotalRevenue: estTotal };
  }, [allMonths, monthlyStreams, entryMap, blendedCpm]);

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

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    return (
      <div className="cpm-chart-tooltip">
        <div className="cpm-chart-tooltip-label">{label}</div>
        <div className="cpm-chart-tooltip-row">
          <span className="cpm-chart-tooltip-dot" data-type="streams" />
          <span>Streams: {d?.streams?.toLocaleString()}</span>
        </div>
        <div className="cpm-chart-tooltip-row">
          <span className="cpm-chart-tooltip-dot" data-type={d?.isActual ? 'actual' : 'estimated'} />
          <span>Revenue: {formatMoney(d?.revenue || 0)} {!d?.isActual && blendedCpm > 0 ? '(est)' : ''}</span>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="panel-header">
        <h2>CPM Calculator</h2>
        <p>Enter payouts for any months you know — the blended CPM is applied across all other months to estimate total revenue.</p>
      </div>

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

      {/* Revenue Timeline Chart */}
      {chartData.length > 0 && blendedCpm > 0 && (
        <div className="chart-card animate-in">
          <div className="chart-card-header">
            <h3>Revenue Timeline</h3>
            <span className="chart-legend">
              <span className="chart-legend-item"><span className="chart-legend-color" data-color="actual" /> Confirmed</span>
              <span className="chart-legend-item"><span className="chart-legend-color" data-color="estimated" /> Estimated</span>
              <span className="chart-legend-item"><span className="chart-legend-color" data-color="streams" /> Streams</span>
            </span>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData}>
              <defs>
                <linearGradient id="cpmStreamGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="cpmRevGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="month" tick={{ fill: '#5a5c72', fontSize: 11 }} tickLine={false} axisLine={false} interval={Math.max(0, Math.floor(chartData.length / 8))} />
              <YAxis yAxisId="streams" orientation="right" tick={{ fill: '#5a5c72', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: any) => formatStreams(v)} width={50} />
              <YAxis yAxisId="revenue" tick={{ fill: '#5a5c72', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: any) => formatCompact(v)} width={55} />
              <Tooltip content={<CustomTooltip />} />
              <Area yAxisId="revenue" type="monotone" dataKey="revenue" stroke="#34d399" strokeWidth={2} fill="url(#cpmRevGrad)" />
              <Area yAxisId="streams" type="monotone" dataKey="streams" stroke="#6366f1" strokeWidth={2} fill="url(#cpmStreamGrad)" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

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
                    <td className="cpm-amount">
                      {editingMonth === month ? (
                        <input
                          className="cpm-inline-input"
                          type="number"
                          step="0.01"
                          autoFocus
                          placeholder="0.00"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter' && editValue && artistId) {
                              const res = await fetch(`/api/artists/${artistId}/revenue`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ month, amount: parseFloat(editValue), note: '' }),
                              });
                              if (res.ok) {
                                const saved = await res.json();
                                const updated = entries.filter(x => x.month !== month);
                                updated.push(saved);
                                updated.sort((a, b) => b.month.localeCompare(a.month));
                                onUpdate(updated);
                              }
                              setEditingMonth(null);
                              setEditValue('');
                            } else if (e.key === 'Escape') {
                              setEditingMonth(null);
                              setEditValue('');
                            }
                          }}
                          onBlur={() => { setEditingMonth(null); setEditValue(''); }}
                        />
                      ) : (
                        <span
                          className="cpm-amount-clickable"
                          onClick={() => { setEditingMonth(month); setEditValue(isActual ? String(entry.amount) : ''); }}
                          title="Click to enter revenue"
                        >
                          {formatMoney(revenue)}{!isActual && blendedCpm > 0 && <span className="cpm-est-badge">est</span>}
                        </span>
                      )}
                    </td>
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
