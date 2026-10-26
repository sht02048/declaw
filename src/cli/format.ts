import type { CoveredPeriod, DataSources, Installation, ReadStatus, Status } from "../engine/index.js";

export const SOURCE_LABELS: Record<keyof DataSources, string> = {
  installRecords: "Install records",
  settings: "Settings",
  pluginFiles: "Plugin files",
  transcripts: "Transcripts",
  skillUsageCounter: "Skill usage counter",
};

export const STATUS_LABELS: Record<Status, string> = {
  unused: "Unused",
  used: "Used",
  "too-new": "Too New",
  unknown: "Unknown",
};

export function kindLabel(installation: Installation): string {
  if (installation.kind === "plugin") return "Plugin";
  if (installation.linked) return "Linked Skill";
  if (installation.synced) return "Synced Skill";
  return "Standalone Skill";
}

export function note(installation: Installation): string {
  if (installation.kind === "plugin") {
    if (installation.enabled === "unknown") return "may be disabled";
    return installation.enabled ? "" : "disabled";
  }
  if (installation.linked) return `links to ${installation.linked.target}`;
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

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
