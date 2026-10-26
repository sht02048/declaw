import type { CoveredPeriod } from "../engine/index.js";
import { formatDate } from "../cli/format.js";
import { countOf } from "../plural.js";

const DAY = 24 * 60 * 60 * 1000;

export function daysBetween(earlier: Date, later: Date): number {
  return Math.round((Date.parse(formatDate(later)) - Date.parse(formatDate(earlier))) / DAY);
}

export function formatAgo(date: Date, now: Date): string {
  const days = daysBetween(date, now);
  if (days <= 0) return "today";
  if (days < 14) return `${days}d ago`;
  if (days < 70) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function formatLastUseAgo(lastUse: Date | null | "unknown", now: Date): string {
  if (lastUse === null) return "never";
  if (lastUse === "unknown") return lastUse;
  return formatAgo(lastUse, now);
}

export function formatPeriodLine({ start, end }: CoveredPeriod): string {
  if (start === null) return "Usage Stats: no transcripts found, so no Uses are known yet";
  return `Usage Stats ${formatDate(start)} – ${formatDate(end)} · ${countOf(daysBetween(start, end) + 1, "day")}`;
}

export function fit(text: string, width: number): string {
  if (text.length <= width) return text.padEnd(width);
  return `${text.slice(0, Math.max(0, width - 1))}…`;
}
