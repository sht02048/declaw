import { Box, Text, useApp, useInput, useWindowSize } from "ink";
import { useRef, useState } from "react";
import {
  isRemovable,
  planCleanup,
  type Installation,
  type PlannedAction,
  type Report,
} from "../engine/index.js";
import {
  formatLastUse,
  formatPeriod,
  formatSources,
  kindLabel,
  note,
  STATUS_LABELS,
} from "../cli/format.js";

export interface AppProps {
  report: Report;
  configDir: string;
  dryRun: boolean;
}

type Screen = "list" | "confirm";

interface Line {
  key: string;
  text: string;
  style?: "bold" | "dim" | "warning" | "cursor";
}

const LIST_KEYS =
  "up/down move · space select · r select recommended · right/left expand · enter review · q quit";
const CONFIRM_KEYS = "up/down scroll · esc back to the list · q quit";

export function App({ report, configDir, dryRun }: AppProps) {
  const { installations } = report;
  const { exit } = useApp();
  const { columns, rows } = useWindowSize();
  const [screen, setScreen] = useState<Screen>("list");
  const [cursor, setCursor] = useState(0);
  const [confirmTop, setConfirmTop] = useState(0);
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const listTop = useRef(0);

  const selected = installations.filter((installation) => selection.has(installation.name));

  const toggle = (installation: Installation) => {
    if (!isRemovable(installation)) return;
    setSelection((current) => {
      const next = new Set(current);
      if (!next.delete(installation.name)) next.add(installation.name);
      return next;
    });
  };

  const setExpandedAtCursor = (open: boolean) => {
    const name = installations[cursor]?.name;
    if (name === undefined) return;
    setExpanded((current) => {
      const next = new Set(current);
      if (open) next.add(name);
      else next.delete(name);
      return next;
    });
  };

  const header: Line[] = [
    { key: "period", text: formatPeriod(report.period), style: "bold" },
    ...formatSources(report.sources, { problemsOnly: true }).map(
      (text): Line => ({ key: text, text, style: "warning" }),
    ),
  ];

  const body =
    screen === "list"
      ? listLines(installations, cursor, selection, expanded)
      : confirmLines(planCleanup(selected, { configDir }), dryRun);
  const footer: Line[] =
    screen === "list"
      ? [
          { key: "gap", text: "" },
          { key: "legend", text: "* recommended for Cleanup", style: "dim" },
          { key: "keys", text: LIST_KEYS, style: "dim" },
        ]
      : [
          { key: "gap", text: "" },
          ...(dryRun ? [{ key: "dry-run", text: "Dry run: nothing will be changed." }] : []),
          { key: "keys", text: CONFIRM_KEYS, style: "dim" },
        ];

  const heightOf = (line: Line) => Math.max(1, Math.ceil(line.text.length / Math.max(1, columns)));
  const room = Math.max(3, rows - 1 - [...header, ...footer].reduce((sum, line) => sum + heightOf(line), 0));
  const heights = body.lines.map(heightOf);

  let top: number;
  if (screen === "list") {
    top = followFocus(heights, body.focus, room, listTop.current);
    listTop.current = top;
  } else {
    top = Math.min(confirmTop, lastTop(heights, room));
  }
  const view = windowFrom(heights, top, room);

  useInput((input, key) => {
    if (input === "q") {
      exit();
      return;
    }
    if (screen === "confirm") {
      if (key.escape) setScreen("list");
      else if (key.upArrow) setConfirmTop(Math.max(0, top - 1));
      else if (key.downArrow) setConfirmTop(Math.min(lastTop(heights, room), top + 1));
      return;
    }
    if (key.upArrow) setCursor((current) => Math.max(0, current - 1));
    else if (key.downArrow) setCursor((current) => Math.min(installations.length - 1, current + 1));
    else if (key.rightArrow) setExpandedAtCursor(true);
    else if (key.leftArrow) setExpandedAtCursor(false);
    else if (input === " " && installations[cursor]) toggle(installations[cursor]);
    else if (input === "r") {
      setSelection(
        (current) =>
          new Set([...current, ...installations.filter((i) => i.recommended).map((i) => i.name)]),
      );
    } else if (key.return && selected.length > 0) {
      setConfirmTop(0);
      setScreen("confirm");
    }
  });

  const shown: Line[] = [
    ...(view.above > 0 ? [{ key: "above", text: `  ${view.above} more above`, style: "dim" as const }] : []),
    ...body.lines.slice(view.start, view.end),
    ...(view.below > 0 ? [{ key: "below", text: `  ${view.below} more below`, style: "dim" as const }] : []),
  ];

  return (
    <Box flexDirection="column">
      {[...header, ...shown, ...footer].map((line) => (
        <Text
          key={line.key}
          bold={line.style === "bold"}
          dimColor={line.style === "dim"}
          inverse={line.style === "cursor"}
          {...(line.style === "warning" && { color: "yellow" })}
        >
          {line.text === "" ? " " : line.text}
        </Text>
      ))}
    </Box>
  );
}

interface Body {
  lines: Line[];
  focus: number;
}

function listLines(
  installations: Installation[],
  cursor: number,
  selection: ReadonlySet<string>,
  expanded: ReadonlySet<string>,
): Body {
  const widths = columnWidths(installations.map(installationCells));
  const lines: Line[] = [];
  let focus = 0;
  installations.forEach((installation, index) => {
    const onCursor = index === cursor;
    if (onCursor) focus = lines.length;
    const checkbox = !isRemovable(installation)
      ? "   "
      : selection.has(installation.name)
        ? "[x]"
        : "[ ]";
    const recommended = installation.recommended ? "*" : " ";
    lines.push({
      key: installation.name,
      text: `${onCursor ? ">" : " "} ${checkbox} ${recommended} ${alignRow(installationCells(installation), widths)}`,
      ...(onCursor && { style: "cursor" as const }),
    });
    if (installation.kind === "plugin" && expanded.has(installation.name)) {
      if (installation.components.length === 0) {
        lines.push({ key: `${installation.name} none`, text: "        no Components found", style: "dim" });
      }
      const componentRows = installation.components.map((component) => [
        component.kind,
        component.name,
        String(component.uses),
        formatLastUse(component.lastUse),
      ]);
      const componentWidths = columnWidths(componentRows);
      for (const row of componentRows) {
        lines.push({
          key: `${installation.name} ${row[0]} ${row[1]}`,
          text: `        ${alignRow(row, componentWidths)}`,
          style: "dim",
        });
      }
    }
  });
  return { lines, focus };
}

function installationCells(installation: Installation): string[] {
  return [
    STATUS_LABELS[installation.status],
    kindLabel(installation),
    installation.name,
    String(installation.uses),
    formatLastUse(installation.lastUse),
    note(installation),
  ];
}

function confirmLines(plan: PlannedAction[], dryRun: boolean): Body {
  const title = dryRun ? "Dry run of the Cleanup of" : "Review the Cleanup of";
  const lines: Line[] = [
    { key: "title", text: `${title} ${plan.length} ${plan.length === 1 ? "Installation" : "Installations"}:` },
  ];
  for (const action of plan) {
    lines.push(
      { key: `${action.name} gap`, text: "" },
      { key: action.name, text: action.name, style: "bold" },
      { key: `${action.name} action`, text: `  ${describe(action)}` },
      { key: `${action.name} undo`, text: `  Undo: ${undo(action)}`, style: "dim" },
    );
  }
  return { lines, focus: 0 };
}

function describe(action: PlannedAction): string {
  switch (action.kind) {
    case "uninstall-plugin":
      return `Uninstall with claude plugin uninstall ${action.name} --scope ${action.scope}`;
    case "remove-link":
      return `Remove the link only, keeping ${action.target}`;
    case "move-to-trash":
      return `Move ${action.path} to the system trash`;
  }
}

function undo(action: PlannedAction): string {
  switch (action.kind) {
    case "uninstall-plugin":
      return action.reinstallCommand;
    case "remove-link":
      return `ln -s ${action.target} ${action.path}`;
    case "move-to-trash":
      return "restore it from the system trash";
  }
}

interface View {
  start: number;
  end: number;
  above: number;
  below: number;
}

function fits(heights: number[], room: number): boolean {
  return heights.reduce((sum, height) => sum + height, 0) <= room;
}

function windowFrom(heights: number[], top: number, room: number): View {
  if (fits(heights, room)) return { start: 0, end: heights.length, above: 0, below: 0 };
  const budget = Math.max(1, room - 2);
  let end = top;
  let used = 0;
  while (end < heights.length && (end === top || used + heights[end]! <= budget)) used += heights[end++]!;
  return { start: top, end, above: top, below: heights.length - end };
}

function followFocus(heights: number[], focus: number, room: number, previousTop: number): number {
  if (fits(heights, room)) return 0;
  let top = Math.min(previousTop, focus);
  while (windowFrom(heights, top, room).end <= focus) top += 1;
  return top;
}

function lastTop(heights: number[], room: number): number {
  if (fits(heights, room)) return 0;
  let top = heights.length - 1;
  while (top > 0 && windowFrom(heights, top - 1, room).end === heights.length) top -= 1;
  return top;
}

function columnWidths(rows: string[][]): number[] {
  return (rows[0] ?? []).map((_, column) => Math.max(...rows.map((row) => row[column]!.length)));
}

function alignRow(row: string[], widths: number[]): string {
  return row
    .map((cell, column) => cell.padEnd(widths[column]!))
    .join("  ")
    .trimEnd();
}
