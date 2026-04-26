'use client';

import { useMemo } from 'react';
import type { DistroKidDataset } from '@/lib/types';

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

interface Props {
  dataCoverage: DataCoverageEntry[];
  uploads: UploadRecord[];
  distrokid?: DistroKidDataset;
}

const LOCATION_COLORS: Record<string, string> = {
  Worldwide: '#a78bfa',
  'United States': '#60a5fa',
  Mexico: '#34d399',
  Other: '#f59e0b',
};

function weekToNum(week: number, year: number): number {
  return year * 52 + week;
}

function formatWeek(week: number, year: number): string {
  return `W${week} '${String(year).slice(2)}`;
}

function fmt(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

export default function DataIntegrityPanel({ dataCoverage, uploads, distrokid }: Props) {
  // Compute global timeline bounds
  const { globalMin, globalMax, totalSpan } = useMemo(() => {
    let min = Infinity, max = -Infinity;
    for (const c of dataCoverage) {
      if (c.firstWeek) min = Math.min(min, weekToNum(c.firstWeek.week, c.firstWeek.year));
      if (c.lastWeek) max = Math.max(max, weekToNum(c.lastWeek.week, c.lastWeek.year));
    }
    if (distrokid?.dateRange) {
      const [minMonth, maxMonth] = distrokid.dateRange;
      const minYear = parseInt(minMonth.split('-')[0]);
      const minWeek = Math.ceil(parseInt(minMonth.split('-')[1]) * 4.33);
      const maxYear = parseInt(maxMonth.split('-')[0]);
      const maxWeek = Math.ceil(parseInt(maxMonth.split('-')[1]) * 4.33);
      min = Math.min(min, weekToNum(minWeek, minYear));
      max = Math.max(max, weekToNum(maxWeek, maxYear));
    }
    if (min === Infinity) { min = weekToNum(1, 2024); max = weekToNum(52, 2025); }
    return { globalMin: min, globalMax: max, totalSpan: Math.max(max - min, 1) };
  }, [dataCoverage, distrokid]);

  const totalGaps = dataCoverage.reduce((s, c) => s + c.gaps.length, 0);
  const totalMissingWeeks = dataCoverage.reduce((s, c) => s + c.gaps.reduce((gs, g) => gs + g.missingWeeks, 0), 0);
  const totalWeeks = dataCoverage.reduce((s, c) => s + c.weekCount, 0);
  const coveragePercent = totalSpan > 0 ? Math.round((totalWeeks / (totalSpan + 1)) * 100) : 0;

  return (
    <div className="panel-container">
      {/* Panel Header */}
      <div className="panel-header">
        <h2>Data Integrity</h2>
        <p>Coverage analysis across all uploaded data sources</p>
      </div>

      <div className="panel-summary">
        {dataCoverage.length + (distrokid ? 1 : 0)} data source{dataCoverage.length + (distrokid ? 1 : 0) !== 1 ? 's' : ''} ingested spanning {totalWeeks} weeks. {totalGaps === 0 ? 'No gaps detected — continuous timeline.' : `${totalGaps} gap${totalGaps > 1 ? 's' : ''} found (${totalMissingWeeks} weeks missing).`}
      </div>

      {/* Summary KPIs */}
      <div className="integrity-kpis">
        <div className="integrity-kpi">
          <div className="integrity-kpi-value">{dataCoverage.length + (distrokid ? 1 : 0)}</div>
          <div className="integrity-kpi-label">Data Sources</div>
        </div>
        <div className="integrity-kpi">
          <div className="integrity-kpi-value">{totalWeeks}</div>
          <div className="integrity-kpi-label">Weeks of Data</div>
        </div>
        <div className="integrity-kpi">
          <div className="integrity-kpi-value">{uploads.length}</div>
          <div className="integrity-kpi-label">Files Uploaded</div>
        </div>
        <div className={`integrity-kpi ${totalGaps === 0 ? 'kpi-good' : 'kpi-warn'}`}>
          <div className="integrity-kpi-value">{totalGaps === 0 ? '✓' : totalGaps}</div>
          <div className="integrity-kpi-label">{totalGaps === 0 ? 'No Gaps' : `Gap${totalGaps > 1 ? 's' : ''} (${totalMissingWeeks}w)`}</div>
        </div>
      </div>

      {/* Timeline visualization */}
      <div className="integrity-section">
        <h3 className="integrity-section-title">Coverage Timeline</h3>
        <p className="integrity-section-desc">Each row shows one data source. Colored bars show where data exists. Gaps appear as empty space.</p>
        
        {/* Timeline header ticks */}
        <div className="timeline-container">
          <div className="timeline-axis">
            <div className="timeline-label-col" />
            <div className="timeline-bar-col">
              {Array.from({ length: Math.min(6, Math.ceil(totalSpan / 13)) }, (_, i) => {
                const weekNum = globalMin + Math.round((i / Math.max(5, Math.ceil(totalSpan / 13) - 1)) * totalSpan);
                const year = Math.floor(weekNum / 52);
                const week = weekNum % 52 || 52;
                const left = ((weekNum - globalMin) / totalSpan) * 100;
                return (
                  <div key={i} className="timeline-tick" style={{ left: `${left}%` }}>
                    {formatWeek(week, year)}
                  </div>
                );
              })}
            </div>
            <div className="timeline-stat-col" />
          </div>

          {/* Luminate data rows */}
          {dataCoverage.map((cov, idx) => {
            const color = LOCATION_COLORS[cov.location] || LOCATION_COLORS.Other;
            const startPct = cov.firstWeek ? ((weekToNum(cov.firstWeek.week, cov.firstWeek.year) - globalMin) / totalSpan) * 100 : 0;
            const endPct = cov.lastWeek ? ((weekToNum(cov.lastWeek.week, cov.lastWeek.year) - globalMin) / totalSpan) * 100 : 0;
            const widthPct = endPct - startPct;

            return (
              <div key={idx} className="timeline-row">
                <div className="timeline-label-col">
                  <span className="timeline-source-dot" style={{ background: color }} />
                  <span className="timeline-source-name">Luminate</span>
                  <span className="timeline-source-loc">{cov.location}</span>
                </div>
                <div className="timeline-bar-col">
                  {/* Main coverage bar */}
                  <div
                    className="timeline-bar"
                    style={{ left: `${startPct}%`, width: `${Math.max(widthPct, 0.5)}%`, background: color }}
                    title={`${cov.weekCount} weeks: ${cov.firstWeek ? formatWeek(cov.firstWeek.week, cov.firstWeek.year) : '?'} → ${cov.lastWeek ? formatWeek(cov.lastWeek.week, cov.lastWeek.year) : '?'}`}
                  />
                  {/* Gap indicators */}
                  {cov.gaps.map((gap, gi) => {
                    const gapStart = ((weekToNum(gap.fromWeek, gap.fromYear) - globalMin) / totalSpan) * 100;
                    const gapEnd = ((weekToNum(gap.toWeek, gap.toYear) - globalMin) / totalSpan) * 100;
                    return (
                      <div
                        key={gi}
                        className="timeline-gap"
                        style={{ left: `${gapStart}%`, width: `${Math.max(gapEnd - gapStart, 0.3)}%` }}
                        title={`Gap: ${formatWeek(gap.fromWeek, gap.fromYear)} → ${formatWeek(gap.toWeek, gap.toYear)} (${gap.missingWeeks} weeks missing)`}
                      >
                        <span className="gap-icon">⚠</span>
                      </div>
                    );
                  })}
                </div>
                <div className="timeline-stat-col">
                  <span className="timeline-stat-weeks">{cov.weekCount}w</span>
                  <span className="timeline-stat-streams">{fmt(cov.totalStreams)}</span>
                </div>
              </div>
            );
          })}

          {/* DistroKid row */}
          {distrokid && distrokid.dateRange && (
            <div className="timeline-row">
              <div className="timeline-label-col">
                <span className="timeline-source-dot" style={{ background: '#fb923c' }} />
                <span className="timeline-source-name">DistroKid</span>
                <span className="timeline-source-loc">Revenue</span>
              </div>
              <div className="timeline-bar-col">
                {(() => {
                  const [minMonth, maxMonth] = distrokid.dateRange;
                  const minYear = parseInt(minMonth.split('-')[0]);
                  const minWeek = Math.ceil(parseInt(minMonth.split('-')[1]) * 4.33);
                  const maxYear = parseInt(maxMonth.split('-')[0]);
                  const maxWeek = Math.ceil(parseInt(maxMonth.split('-')[1]) * 4.33);
                  const startPct = ((weekToNum(minWeek, minYear) - globalMin) / totalSpan) * 100;
                  const endPct = ((weekToNum(maxWeek, maxYear) - globalMin) / totalSpan) * 100;
                  return (
                    <div
                      className="timeline-bar"
                      style={{ left: `${startPct}%`, width: `${Math.max(endPct - startPct, 0.5)}%`, background: '#fb923c' }}
                      title={`${minMonth} → ${maxMonth}`}
                    />
                  );
                })()}
              </div>
              <div className="timeline-stat-col">
                <span className="timeline-stat-weeks">{distrokid.monthlyRevenue?.length || 0}mo</span>
                <span className="timeline-stat-streams">${distrokid.totalEarnings?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Upload history */}
      <div className="integrity-section">
        <h3 className="integrity-section-title">Upload History</h3>
        <p className="integrity-section-desc">Every file that contributed data to this artist. Duplicate uploads are automatically deduplicated — no double-counting.</p>
        
        <div className="integrity-uploads">
          {uploads.length === 0 && (
            <div className="integrity-empty">No uploads recorded yet.</div>
          )}
          {uploads.map((u) => (
            <div key={u.id} className="integrity-upload-row">
              <div className="upload-row-icon">
                {u.fileType === 'distrokid' ? '$' : u.fileType === 'luminate-trends' ? '∿' : '◆'}
              </div>
              <div className="upload-row-info">
                <div className="upload-row-name">{u.fileName}</div>
                <div className="upload-row-meta">
                  <span className={`upload-type-badge ${u.fileType}`}>{u.fileType.replace('luminate-', '').toUpperCase()}</span>
                  <span>{u.location}</span>
                  {u.weekCount > 0 && <span>{u.weekCount} weeks</span>}
                  {u.songCount > 0 && <span>{u.songCount} songs</span>}
                  <span>{fmt(u.totalStreams)} streams</span>
                </div>
              </div>
              <div className="upload-row-date">
                {new Date(u.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Data integrity status */}
      <div className="integrity-section">
        <h3 className="integrity-section-title">Integrity Status</h3>
        <div className="integrity-checks">
          <div className={`integrity-check ${totalGaps === 0 ? 'check-pass' : 'check-warn'}`}>
            <span className="check-icon">{totalGaps === 0 ? '✓' : '⚠'}</span>
            <div className="check-info">
              <div className="check-label">Timeline Continuity</div>
              <div className="check-desc">
                {totalGaps === 0 
                  ? 'No gaps detected — continuous weekly data across all locations.'
                  : `${totalGaps} gap${totalGaps > 1 ? 's' : ''} detected (${totalMissingWeeks} missing weeks). Upload additional reports to fill gaps.`}
              </div>
            </div>
          </div>
          <div className="integrity-check check-pass">
            <span className="check-icon">✓</span>
            <div className="check-info">
              <div className="check-label">Deduplication</div>
              <div className="check-desc">All data uses unique constraints (artist + location + week + year). Overlapping uploads update — never double-count.</div>
            </div>
          </div>
          <div className={`integrity-check ${coveragePercent >= 80 ? 'check-pass' : coveragePercent >= 50 ? 'check-info' : 'check-warn'}`}>
            <span className="check-icon">{coveragePercent >= 80 ? '✓' : 'ℹ'}</span>
            <div className="check-info">
              <div className="check-label">Coverage Density</div>
              <div className="check-desc">{coveragePercent}% of the timeline span has data. {coveragePercent < 80 ? 'Upload broader-range reports for fuller coverage.' : 'Strong coverage — data is comprehensive.'}</div>
            </div>
          </div>
          <div className={`integrity-check ${dataCoverage.length > 1 ? 'check-pass' : 'check-info'}`}>
            <span className="check-icon">{dataCoverage.length > 1 ? '✓' : 'ℹ'}</span>
            <div className="check-info">
              <div className="check-label">Multi-Location</div>
              <div className="check-desc">
                {dataCoverage.length > 1
                  ? `${dataCoverage.length} locations tracked: ${dataCoverage.map(c => c.location).join(', ')}`
                  : dataCoverage.length === 1
                    ? `Only ${dataCoverage[0].location} tracked. Upload geo-specific reports for regional breakdowns.`
                    : 'No location data yet.'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
