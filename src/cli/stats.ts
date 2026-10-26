import type { Report } from "../engine/index.js";
import {
  alignRow,
  columnWidths,
  formatLastUse,
  formatPeriod,
  formatSources,
  kindLabel,
  note,
  USAGE_STATUS_LABELS,
} from "./format.js";

const USES_COLUMN = 4;

export function formatStatsJson(report: Report): string {
  return JSON.stringify(report, null, 2) + "\n";
}

export function formatStatsText(report: Report): string {
  const rows = [
    ["", "USAGE", "KIND", "NAME", "USES", "LAST USE", "HOOKS", "NOTE"],
    ...report.installations.map((installation) => [
      installation.recommended ? "*" : "",
      USAGE_STATUS_LABELS[installation.usageStatus],
      kindLabel(installation),
      installation.name,
      String(installation.uses),
      formatLastUse(installation.lastUse),
      installation.kind === "plugin" ? String(installation.hooks) : "",
      note(installation),
    ]),
  ];
  const widths = columnWidths(rows);
  const table = rows.map((row) => alignRow(row, widths, new Set([USES_COLUMN])));

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
