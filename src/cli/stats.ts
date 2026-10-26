import type { Installation, Report } from "../engine/index.js";

export function formatStatsJson(report: Report): string {
  return JSON.stringify(report, null, 2) + "\n";
}

const KIND_LABELS: Record<Installation["kind"], string> = {
  plugin: "Plugin",
  "standalone-skill": "Standalone Skill",
};

export function formatStatsText(report: Report): string {
  const { start, end } = report.period;
  const header =
    start === null
      ? "Usage Stats: no transcripts found, so no Uses are known yet"
      : `Usage Stats from ${formatDate(start)} to ${formatDate(end)}`;

  const rows = [
    ["KIND", "NAME", "USES", "LAST USE", "HOOKS"],
    ...report.installations.map((installation) => [
      KIND_LABELS[installation.kind],
      installation.name,
      String(installation.uses),
      installation.lastUse === null ? "never" : formatDate(installation.lastUse),
      installation.kind === "plugin" ? String(installation.hooks) : "",
    ]),
  ];
  const widths = rows[0]!.map((_, column) => Math.max(...rows.map((row) => row[column]!.length)));
  const table = rows.map((row) =>
    row
      .map((cell, column) => (column === 2 ? cell.padStart(widths[column]!) : cell.padEnd(widths[column]!)))
      .join("  ")
      .trimEnd(),
  );

  return [header, "", ...table, ""].join("\n");
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
