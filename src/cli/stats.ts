import type { Installation, Report, Status } from "../engine/index.js";

export function formatStatsJson(report: Report): string {
  return JSON.stringify(report, null, 2) + "\n";
}

const KIND_LABELS: Record<Installation["kind"], string> = {
  plugin: "Plugin",
  "standalone-skill": "Standalone Skill",
};

function kindLabel(installation: Installation): string {
  if (installation.kind === "plugin") return KIND_LABELS.plugin;
  if (installation.linked) return "Linked Skill";
  if (installation.synced) return "Synced Skill";
  return KIND_LABELS[installation.kind];
}

const STATUS_LABELS: Record<Status, string> = {
  unused: "Unused",
  used: "Used",
  "too-new": "Too New",
};

function note(installation: Installation): string {
  if (installation.kind === "plugin") return installation.enabled ? "" : "disabled";
  if (installation.linked) return `links to ${installation.linked.target}`;
  if (installation.synced) return "managed by claude.ai";
  return "";
}

export function formatStatsText(report: Report): string {
  const { start, end } = report.period;
  const header =
    start === null
      ? "Usage Stats: no transcripts found, so no Uses are known yet"
      : `Usage Stats from ${formatDate(start)} to ${formatDate(end)}`;

  const rows = [
    ["", "STATUS", "KIND", "NAME", "USES", "LAST USE", "HOOKS", "NOTE"],
    ...report.installations.map((installation) => [
      installation.recommended ? "*" : "",
      STATUS_LABELS[installation.status],
      kindLabel(installation),
      installation.name,
      String(installation.uses),
      installation.lastUse === null ? "never" : formatDate(installation.lastUse),
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

  return [header, "", ...table, "", "* recommended for Cleanup", ""].join("\n");
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
