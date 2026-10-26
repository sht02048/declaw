import type { CoveredPeriod, DataSources, Installation, ReadStatus, Unknown, UsageStatus } from "../engine/index.js";
import { plural } from "../plural.js";

export const SOURCE_LABELS: Record<keyof DataSources, string> = {
  installRecords: "Install records",
  settings: "Settings",
  pluginFiles: "Plugin files",
  transcripts: "Transcripts",
  skillUsageCounter: "Skill usage counter",
};

export const USAGE_STATUS_LABELS: Record<UsageStatus, string> = {
  unused: "Unused",
  used: "Used",
  unknown: "Unknown",
};

export function kindLabel(installation: Installation): string {
  if (installation.kind === "plugin") return "Plugin";
  if (installation.linked) return "Linked Skill";
  if (installation.synced) return "Synced Skill";
  return "Standalone Skill";
}

export function installNote(installation: Installation): string {
  if (installation.kind === "plugin") {
    if (installation.enabled === "unknown") return "may be disabled";
    return installation.enabled ? "" : "disabled";
  }
  if (installation.linked) {
    return `${installation.linked.broken ? "broken link" : "links"} to ${installation.linked.target}`;
  }
  if (installation.synced) return "managed by claude.ai";
  return "";
}

export function formatPeriod({ start, end }: CoveredPeriod): string {
  return start === null
    ? "Usage Stats: no transcripts found, so no Uses are known yet"
    : `Usage Stats from ${formatDate(start)} to ${formatDate(end)}`;
}

export function formatSources(sources: DataSources, { problemsOnly = false } = {}): string[] {
  return (Object.keys(SOURCE_LABELS) as (keyof DataSources)[])
    .filter((source) => !problemsOnly || sources[source].status !== "readable")
    .map((source) => `${SOURCE_LABELS[source]}: ${formatReadStatus(sources[source])}`);
}

function formatReadStatus(read: ReadStatus): string {
  return read.status === "readable" ? read.status : `${read.status} (${read.reason})`;
}

export function formatLastUse(lastUse: Installation["lastUse"]): string {
  if (lastUse === null) return "never";
  if (lastUse === "unknown") return lastUse;
  return formatDate(lastUse);
}

export function columnWidths(rows: string[][]): number[] {
  return (rows[0] ?? []).map((_, column) => Math.max(...rows.map((row) => row[column]!.length)));
}

export function alignRow(row: string[], widths: number[], rightAligned: ReadonlySet<number> = new Set()): string {
  return row
    .map((cell, column) => (rightAligned.has(column) ? cell.padStart(widths[column]!) : cell.padEnd(widths[column]!)))
    .join("  ")
    .trimEnd();
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatHookCount(hooks: number | Unknown): string {
  return hooks === "unknown" ? "hooks unknown" : `${hooks} ${plural(hooks, "hook")}`;
}

export function formatHooksPerSession(hooks: number | Unknown): string {
  if (hooks === "unknown") return "hooks run every session: unknown";
  return `${formatHookCount(hooks)} ${hooks === 1 ? "runs" : "run"} every session`;
}
