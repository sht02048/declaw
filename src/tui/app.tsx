import { Box, Text, useApp, useInput, useWindowSize } from "ink";
import { useEffect, useReducer, useRef } from "react";
import wrapAnsi from "wrap-ansi";
import {
  isRemovable,
  planCleanup,
  type CleanupOutcome,
  type Component,
  type Installation,
  type PlannedAction,
  type Report,
} from "../engine/index.js";
import { actionText } from "../cli/actions.js";
import {
  alignRow,
  columnWidths,
  formatHookCount,
  formatHooksPerSession,
  formatLastUse,
  formatPeriod,
  formatSources,
  kindLabel,
  note,
  USAGE_STATUS_LABELS,
} from "../cli/format.js";
import { formatCleanupSummary } from "../cli/summary.js";
import { countOf } from "../plural.js";

export interface AppProps {
  report: Report;
  configDir: string;
  dryRun: boolean;
  cleanup: (selection: Installation[]) => Promise<CleanupOutcome[]>;
}

type Screen = "list" | "confirm" | "running" | "summary";

interface Line {
  key: string;
  text: string;
  style?: "bold" | "dim" | "warning" | "cursor";
}

const LIST_KEYS =
  "up/down move · space select · r recommended · right/left expand · enter review · q quit";
const DRY_RUN_KEYS = "up/down scroll · esc back to the list · q quit";
const CONFIRM_KEYS = `y run the Cleanup · ${DRY_RUN_KEYS}`;
const SUMMARY_KEYS = "up/down scroll · q quit";

export function App({ report, configDir, dryRun, cleanup }: AppProps) {
  const { installations } = report;
  const { exit } = useApp();
  const { columns, rows } = useWindowSize();
  const [state, dispatch] = useReducer(reducerFor(installations, dryRun), INITIAL_STATE);
  const { screen, cursor, pageTop, selection, expanded } = state;
  const listTop = useRef(0);

  const selected = installations.filter((installation) => selection.has(installation.name));

  const header: Line[] = [
    { key: "period", text: formatPeriod(report.period), style: "bold" },
    ...formatSources(report.sources, { problemsOnly: true }).map(
      (text): Line => ({ key: text, text, style: "warning" }),
    ),
  ];

  useEffect(() => {
    if (screen !== "running") return;
    void cleanup(selected).then((outcomes) => dispatch({ type: "finished", outcomes }));
  }, [screen]);

  const body = bodyOf(state, installations, () => planCleanup(selected, { configDir }), dryRun);
  const footer = footerOf(state, dryRun);

  const heightOf = (line: Line) =>
    wrapAnsi(line.text, Math.max(1, columns), { trim: false, hard: true }).split("\n").length;
  const room = Math.max(3, rows - 1 - [...header, ...footer].reduce((sum, line) => sum + heightOf(line), 0));
  const heights = body.lines.map(heightOf);

  let top: number;
  if (screen === "list") {
    top = followFocus(heights, body.focus, body.focusEnd ?? body.focus, room, listTop.current);
    listTop.current = top;
  } else {
    top = Math.min(pageTop, lastTop(heights, room));
  }
  const view = windowFrom(heights, top, room);

  useInput((input, key) => {
    if (key.escape) dispatch({ type: "back" });
    else if (key.upArrow) dispatch({ type: "up", lastPageTop: lastTop(heights, room) });
    else if (key.downArrow) dispatch({ type: "down", lastPageTop: lastTop(heights, room) });
    else if (key.rightArrow) dispatch({ type: "expand", open: true });
    else if (key.leftArrow) dispatch({ type: "expand", open: false });
    else if (key.return) dispatch({ type: "review" });
    // Keys typed faster than a render arrive as one chunk, such as "r\r".
    else if (!key.ctrl && !key.meta) {
      for (const character of input) {
        if (character === "q") {
          if (screen !== "running") exit();
        } else if (character === " ") dispatch({ type: "toggle" });
        else if (character === "y") dispatch({ type: "proceed" });
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
  pageTop: number;
  outcomes: CleanupOutcome[];
  needsSelection: boolean;
  selection: ReadonlySet<string>;
  expanded: ReadonlySet<string>;
}

type Action =
  | { type: "up"; lastPageTop: number }
  | { type: "down"; lastPageTop: number }
  | { type: "expand"; open: boolean }
  | { type: "toggle" }
  | { type: "select-recommended" }
  | { type: "review" }
  | { type: "proceed" }
  | { type: "finished"; outcomes: CleanupOutcome[] }
  | { type: "back" };

const INITIAL_STATE: State = {
  screen: "list",
  cursor: 0,
  pageTop: 0,
  outcomes: [],
  needsSelection: false,
  selection: new Set(),
  expanded: new Set(),
};

function reducerFor(installations: Installation[], dryRun: boolean) {
  return (state: State, action: Action): State => {
    if (state.screen === "running") {
      return action.type === "finished"
        ? { ...state, screen: "summary", pageTop: 0, outcomes: action.outcomes }
        : state;
    }
    if (state.screen === "confirm" || state.screen === "summary") {
      switch (action.type) {
        case "back":
          return state.screen === "confirm" ? { ...state, screen: "list" } : state;
        case "proceed":
          return state.screen === "confirm" && !dryRun ? { ...state, screen: "running" } : state;
        case "up":
          return { ...state, pageTop: Math.max(0, Math.min(state.pageTop, action.lastPageTop) - 1) };
        case "down":
          return { ...state, pageTop: Math.min(action.lastPageTop, state.pageTop + 1) };
        default:
          return state;
      }
    }
    const listRows = listRowsOf(installations, state.expanded);
    const current = installations[listRows[state.cursor]?.index ?? -1];
    switch (action.type) {
      case "up":
        return { ...state, cursor: Math.max(0, state.cursor - 1) };
      case "down":
        return { ...state, cursor: Math.min(listRows.length - 1, state.cursor + 1) };
      case "expand": {
        if (!current) return state;
        const expanded = withName(state.expanded, current.name, action.open);
        const row = listRowsOf(installations, expanded).findIndex(
          (listRow) => installations[listRow.index] === current && !isChild(listRow),
        );
        return { ...state, expanded, cursor: row };
      }
      case "toggle":
        if (!current || !isRemovable(current)) return state;
        return {
          ...state,
          needsSelection: false,
          selection: withName(state.selection, current.name, !state.selection.has(current.name)),
        };
      case "select-recommended":
        return {
          ...state,
          needsSelection: false,
          selection: new Set([
            ...state.selection,
            ...installations.filter((i) => i.recommended).map((i) => i.name),
          ]),
        };
      case "review":
        return state.selection.size === 0
          ? { ...state, needsSelection: true }
          : { ...state, screen: "confirm", pageTop: 0 };
      case "proceed":
      case "finished":
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

interface ListRow {
  index: number;
  component?: number;
  hooks?: true;
}

function listRowsOf(installations: Installation[], expanded: ReadonlySet<string>): ListRow[] {
  return installations.flatMap((installation, index): ListRow[] => {
    if (installation.kind !== "plugin" || !expanded.has(installation.name)) return [{ index }];
    const count = Math.max(1, installation.components.length);
    return [
      { index },
      ...Array.from({ length: count }, (_, component) => ({ index, component })),
      { index, hooks: true },
    ];
  });
}

function isChild(listRow: ListRow | undefined): boolean {
  return listRow?.component !== undefined || listRow?.hooks === true;
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
  const listRows = listRowsOf(installations, expanded);
  const lines = listRows.map((listRow, line): Line => {
    const installation = installations[listRow.index]!;
    const onCursor = line === cursor;
    const marker = onCursor ? ">" : " ";
    const style = onCursor ? { style: "cursor" as const } : { style: "dim" as const };
    if (listRow.hooks && installation.kind === "plugin") {
      return {
        key: `${installation.name} hooks`,
        text: `${marker}       ${formatHooksPerSession(installation.hooks)}`,
        ...style,
      };
    }
    if (listRow.component !== undefined) {
      const component = installation.kind === "plugin" ? installation.components[listRow.component] : undefined;
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
  if (!isChild(listRows[cursor])) {
    while (isChild(listRows[focusEnd + 1])) focusEnd += 1;
  }
  return { lines, focus: cursor, focusEnd };
}

function componentCells(component: Component): string[] {
  return [component.kind, component.name, String(component.uses), formatLastUse(component.lastUse)];
}

function installationCells(installation: Installation): string[] {
  return [
    USAGE_STATUS_LABELS[installation.usageStatus],
    kindLabel(installation),
    installation.name,
    String(installation.uses),
    formatLastUse(installation.lastUse),
    installation.kind === "plugin"
      ? [formatHookCount(installation.hooks), note(installation)].filter(Boolean).join(", ")
      : note(installation),
  ];
}

function bodyOf(
  state: State,
  installations: Installation[],
  plan: () => PlannedAction[],
  dryRun: boolean,
): Body {
  switch (state.screen) {
    case "list":
      return listLines(installations, state.cursor, state.selection, state.expanded);
    case "confirm":
      return confirmLines(plan(), dryRun);
    case "running":
      return { lines: [{ key: "running", text: `Cleaning up ${countOf(state.selection.size, "Installation")}...` }], focus: 0 };
    case "summary":
      return summaryLines(state.outcomes);
  }
}

function footerOf(state: State, dryRun: boolean): Line[] {
  const gap: Line = { key: "gap", text: "" };
  switch (state.screen) {
    case "list":
      return [
        gap,
        { key: "legend", text: "* recommended for Cleanup", style: "dim" },
        ...(state.needsSelection
          ? [{ key: "hint", text: "Select at least one Installation to review.", style: "warning" as const }]
          : []),
        { key: "keys", text: LIST_KEYS, style: "dim" },
      ];
    case "confirm":
      return dryRun
        ? [
            gap,
            { key: "dry-run", text: "Dry run: nothing will be changed." },
            { key: "keys", text: DRY_RUN_KEYS, style: "dim" },
          ]
        : [gap, { key: "keys", text: CONFIRM_KEYS, style: "dim" }];
    case "running":
      return [];
    case "summary":
      return [gap, { key: "keys", text: SUMMARY_KEYS, style: "dim" }];
  }
}

function summaryLines(outcomes: CleanupOutcome[]): Body {
  const lines = formatCleanupSummary(outcomes)
    .replace(/\n$/, "")
    .split("\n")
    .map((text, index): Line => ({ key: `summary ${index}`, text }));
  return { lines, focus: 0 };
}

function confirmLines(plan: PlannedAction[], dryRun: boolean): Body {
  const title = dryRun ? "Dry run of the Cleanup of" : "Review the Cleanup of";
  const lines: Line[] = [
    { key: "title", text: `${title} ${countOf(plan.length, "Installation")}:` },
  ];
  for (const action of plan) {
    const { describe, undo } = actionText(action);
    lines.push(
      { key: `${action.name} gap`, text: "" },
      { key: action.name, text: action.name, style: "bold" },
      { key: `${action.name} action`, text: `  ${describe}` },
      { key: `${action.name} undo`, text: `  Undo: ${undo}`, style: "dim" },
    );
  }
  return { lines, focus: 0 };
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
