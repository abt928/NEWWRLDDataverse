/**
 * Utility functions: formatters, color scales, helpers
 */

/** Format large numbers with K/M suffixes */
export function formatNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) {
    return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (Math.abs(n) >= 1_000) {
    return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return n.toLocaleString();
}

/** Format number with full commas */
export function formatFullNumber(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/** Format as currency */
export function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

/** Format percentage */
export function formatPct(n: number, decimals = 1): string {
  return n.toFixed(decimals) + '%';
}

/** Format a signed percentage with arrow */
export function formatTrend(n: number): string {
  const arrow = n > 0 ? '↑' : n < 0 ? '↓' : '→';
  return `${arrow} ${Math.abs(n).toFixed(1)}%`;
}

/** Trend color class */
export function trendColor(n: number): string {
  if (n > 5) return 'var(--color-emerald)';
  if (n < -5) return 'var(--color-red)';
  return 'var(--color-amber)';
}

/** Chart colors palette */
export const CHART_COLORS = [
  '#6366f1', // indigo
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
  '#84cc16', // lime
];

/** Get a color from the palette by index */
export function getChartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

/** Truncate long text */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

/** Parse date range string to get start date as Date object */
export function parseDateRange(dateRange: string): { start: Date; end: Date } {
  const [startStr, endStr] = dateRange.split(' - ');
  return {
    start: new Date(startStr.replace(/\//g, '-')),
    end: new Date(endStr.replace(/\//g, '-')),
  };
}

/** Format a date range for display */
export function formatDateRange(dateRange: string): string {
  const { start, end } = parseDateRange(dateRange);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const startF = start.toLocaleDateString('en-US', opts);
  const endF = end.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
  return `${startF} – ${endF}`;
}

/** className helper */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
