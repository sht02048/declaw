import type { Report } from "../engine/index.js";
import { formatLastUse, formatPeriod, formatSources, kindLabel, note, STATUS_LABELS } from "./format.js";

export function formatStatsJson(report: Report): string {
  return JSON.stringify(report, null, 2) + "\n";
}

export function formatStatsText(report: Report): string {
  const rows = [
    ["", "STATUS", "KIND", "NAME", "USES", "LAST USE", "HOOKS", "NOTE"],
    ...report.installations.map((installation) => [
      installation.recommended ? "*" : "",
      STATUS_LABELS[installation.status],
      kindLabel(installation),
      installation.name,
      String(installation.uses),
      formatLastUse(installation.lastUse),
      installation.kind === "plugin" ? String(installation.hooks) : "",
      note(installation),
    ]),
  ];
  const widths = rows[0]!.map((_, column) => Math.max(...rows.map((row) => row[column]!.length)));
  const table = rows.map((row) =>
    row
      .map((cell, column) => (column === 4 ? cell.padStart(widths[column]!) : cell.padEnd(widths[column]!)))
      .join("  ")
      .trimEnd(),
  );

  return [
    formatPeriod(report.period),
    ...formatSources(report.sources),
    "",
    ...table,
    "",
    "* recommended for Cleanup",
    "",
  ].join("\n");
}
