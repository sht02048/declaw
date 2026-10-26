import { Box, Text, useApp, useInput, useWindowSize } from "ink";
import { useReducer, useRef } from "react";
import wrapAnsi from "wrap-ansi";
import {
  isRemovable,
  planCleanup,
  type Component,
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
  "up/down move · space select · r recommended · right/left expand · enter review · q quit";
const CONFIRM_KEYS = "up/down scroll · esc back to the list · q quit";

export function App({ report, configDir, dryRun }: AppProps) {
  const { installations } = report;
  const { exit } = useApp();
  const { columns, rows } = useWindowSize();
  const [state, dispatch] = useReducer(reducerFor(installations), INITIAL_STATE);
  const { screen, cursor, confirmTop, selection, expanded } = state;
  const listTop = useRef(0);

  const selected = installations.filter((installation) => selection.has(installation.name));

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

  const heightOf = (line: Line) =>
    wrapAnsi(line.text, Math.max(1, columns), { trim: false, hard: true }).split("\n").length;
  const room = Math.max(3, rows - 1 - [...header, ...footer].reduce((sum, line) => sum + heightOf(line), 0));
  const heights = body.lines.map(heightOf);

  let top: number;
  if (screen === "list") {
    top = followFocus(heights, body.focus, body.focusEnd ?? body.focus, room, listTop.current);
    listTop.current = top;
  } else {
    top = Math.min(confirmTop, lastTop(heights, room));
  }
  const view = windowFrom(heights, top, room);

  useInput((input, key) => {
    if (key.escape) dispatch({ type: "back" });
    else if (key.upArrow) dispatch({ type: "up" });
    else if (key.downArrow) dispatch({ type: "down", lastConfirmTop: lastTop(heights, room) });
    else if (key.rightArrow) dispatch({ type: "expand", open: true });
    else if (key.leftArrow) dispatch({ type: "expand", open: false });
    else if (key.return) dispatch({ type: "review" });
    // Keys typed faster than a render arrive as one chunk, such as "r\r".
    else if (!key.ctrl && !key.meta) {
      for (const character of input) {
        if (character === "q") exit();
        else if (character === " ") dispatch({ type: "toggle" });
        else if (character === "r") dispatch({ type: "select-recommended" });
        else if (character === "\r") dispatch({ type: "review" });
      }
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

interface State {
  screen: Screen;
  cursor: number;
  confirmTop: number;
  selection: ReadonlySet<string>;
  expanded: ReadonlySet<string>;
}

type Action =
  | { type: "up" }
  | { type: "down"; lastConfirmTop: number }
  | { type: "expand"; open: boolean }
  | { type: "toggle" }
  | { type: "select-recommended" }
  | { type: "review" }
  | { type: "back" };

const INITIAL_STATE: State = {
  screen: "list",
  cursor: 0,
  confirmTop: 0,
  selection: new Set(),
  expanded: new Set(),
};

function reducerFor(installations: Installation[]) {
  return (state: State, action: Action): State => {
    if (state.screen === "confirm") {
      switch (action.type) {
        case "back":
          return { ...state, screen: "list" };
        case "up":
          return { ...state, confirmTop: Math.max(0, state.confirmTop - 1) };
        case "down":
          return { ...state, confirmTop: Math.min(action.lastConfirmTop, state.confirmTop + 1) };
        default:
          return state;
      }
    }
    const entries = entriesOf(installations, state.expanded);
    const current = installations[entries[state.cursor]?.index ?? -1];
    switch (action.type) {
      case "up":
        return { ...state, cursor: Math.max(0, state.cursor - 1) };
      case "down":
        return { ...state, cursor: Math.min(entries.length - 1, state.cursor + 1) };
      case "expand": {
        if (!current) return state;
        const expanded = withName(state.expanded, current.name, action.open);
        const row = entriesOf(installations, expanded).findIndex(
          (entry) => installations[entry.index] === current && entry.component === undefined,
        );
        return { ...state, expanded, cursor: row };
      }
      case "toggle":
        if (!current || !isRemovable(current)) return state;
        return {
          ...state,
          selection: withName(state.selection, current.name, !state.selection.has(current.name)),
        };
      case "select-recommended":
        return {
          ...state,
          selection: new Set([
            ...state.selection,
            ...installations.filter((i) => i.recommended).map((i) => i.name),
          ]),
        };
      case "review":
        return state.selection.size === 0 ? state : { ...state, screen: "confirm", confirmTop: 0 };
      case "back":
        return state;
    }
  };
}

function withName(names: ReadonlySet<string>, name: string, present: boolean): ReadonlySet<string> {
  const next = new Set(names);
  if (present) next.add(name);
  else next.delete(name);
  return next;
}

interface Body {
  lines: Line[];
  focus: number;
  focusEnd?: number;
}

interface Entry {
  index: number;
  component?: number;
}

function entriesOf(installations: Installation[], expanded: ReadonlySet<string>): Entry[] {
  return installations.flatMap((installation, index): Entry[] => {
    if (installation.kind !== "plugin" || !expanded.has(installation.name)) return [{ index }];
    const count = Math.max(1, installation.components.length);
    return [{ index }, ...Array.from({ length: count }, (_, component) => ({ index, component }))];
  });
}

function listLines(
  installations: Installation[],
  cursor: number,
  selection: ReadonlySet<string>,
  expanded: ReadonlySet<string>,
): Body {
  const widths = columnWidths(installations.map(installationCells));
  const componentWidths = new Map(
    installations.map((installation) => [
      installation,
      installation.kind === "plugin" ? columnWidths(installation.components.map(componentCells)) : [],
    ]),
  );
  const entries = entriesOf(installations, expanded);
  const lines = entries.map((entry, line): Line => {
    const installation = installations[entry.index]!;
    const onCursor = line === cursor;
    const marker = onCursor ? ">" : " ";
    const style = onCursor ? { style: "cursor" as const } : { style: "dim" as const };
    if (entry.component !== undefined) {
      const component = installation.kind === "plugin" ? installation.components[entry.component] : undefined;
      const text = component
        ? alignRow(componentCells(component), componentWidths.get(installation)!)
        : "no Components found";
      return {
        key: `${installation.name} ${component ? `${component.kind} ${component.name}` : "none"}`,
        text: `${marker}       ${text}`,
        ...style,
      };
    }
    const checkbox = !isRemovable(installation)
      ? "   "
      : selection.has(installation.name)
        ? "[x]"
        : "[ ]";
    const recommended = installation.recommended ? "*" : " ";
    return {
      key: installation.name,
      text: `${marker} ${checkbox} ${recommended} ${alignRow(installationCells(installation), widths)}`,
      ...(onCursor && style),
    };
  });
  let focusEnd = cursor;
  if (entries[cursor]?.component === undefined) {
    while (entries[focusEnd + 1]?.component !== undefined) focusEnd += 1;
  }
  return { lines, focus: cursor, focusEnd };
}

function componentCells(component: Component): string[] {
  return [component.kind, component.name, String(component.uses), formatLastUse(component.lastUse)];
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
      return action.relinkCommand;
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

function followFocus(
  heights: number[],
  focus: number,
  focusEnd: number,
  room: number,
  previousTop: number,
): number {
  if (fits(heights, room)) return 0;
  let top = Math.min(previousTop, focus);
  while (top < focus && windowFrom(heights, top, room).end <= focusEnd) top += 1;
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
