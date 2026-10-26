import type { DataSources, Installation, ReadStatus, Report } from "../engine/index.js";

export function formatStatsJson(report: Report): string {
  return JSON.stringify(report, null, 2) + "\n";
}

const SOURCE_LABELS: Record<keyof DataSources, string> = {
  transcripts: "Transcripts",
  skillUsageCounter: "Skill usage counter",
};

const KIND_LABELS: Record<Installation["kind"], string> = {
  "standalone-skill": "Standalone Skill",
};

export function formatStatsText(report: Report): string {
  const { start, end } = report.period;
  const header =
    start === null
      ? "Usage Stats: no transcripts found, so no Uses are known yet"
      : `Usage Stats from ${formatDate(start)} to ${formatDate(end)}`;

  const rows = [
    ["KIND", "NAME", "USES", "LAST USE"],
    ...report.installations.map((installation) => [
      KIND_LABELS[installation.kind],
      installation.name,
      String(installation.uses),
      formatLastUse(installation.lastUse),
    ]),
  ];
  const widths = rows[0]!.map((_, column) => Math.max(...rows.map((row) => row[column]!.length)));
  const table = rows.map((row) =>
    row
      .map((cell, column) => (column === 2 ? cell.padStart(widths[column]!) : cell.padEnd(widths[column]!)))
      .join("  ")
      .trimEnd(),
  );

  const sources = (Object.keys(SOURCE_LABELS) as (keyof DataSources)[]).map(
    (source) => `${SOURCE_LABELS[source]}: ${formatReadStatus(report.sources[source])}`,
  );

  return [header, ...sources, "", ...table, ""].join("\n");
}

function formatReadStatus(read: ReadStatus): string {
  return read.status === "readable" ? read.status : `${read.status} (${read.reason})`;
}

function formatLastUse(lastUse: Installation["lastUse"]): string {
  if (lastUse === null) return "never";
  if (lastUse === "unknown") return lastUse;
  return formatDate(lastUse);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
