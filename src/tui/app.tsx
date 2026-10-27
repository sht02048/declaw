import { Box, Text, useApp, useInput, useWindowSize } from "ink";
import { useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { Spinner } from "@inkjs/ui";
import {
  isRemovable,
  planCleanup,
  type CleanupOutcome,
  type Installation,
  type PlannedAction,
  type Report,
} from "../engine/index.js";
import { formatSources } from "../cli/format.js";
import { countOf } from "../plural.js";
import {
  columnHeader,
  columnsFor,
  componentLine,
  countsLine,
  groupedByUsageStatus,
  groupHeader,
  hooksLine,
  idOf,
  installationLine,
  isChild,
  kindTabsOf,
  listRowsOf,
  tabBar,
  type Columns,
  type KindTab,
} from "./list.js";
import { confirmHeading, confirmLines } from "./confirm.js";
import { DetailPanel, detailLines } from "./detail.js";
import { summaryHeading, summaryLines } from "./summary.js";
import { formatPeriodLine } from "./text.js";

export interface AppProps {
  report: Report;
  configDir: string;
  backupDir: string;
  now: Date;
  dryRun: boolean;
  cleanup: (selection: Installation[]) => Promise<CleanupOutcome[]>;
}

type Screen = "list" | "confirm" | "running" | "summary";

interface Line {
  key: string;
  element?: ReactNode;
  content?: ReactNode;
  wrap?: "truncate-end" | "truncate-middle";
  style?: "bold" | "dim" | "warning";
}

type Keys = [key: string, label: string, color?: string][];

const LIST_KEYS: Keys = [
  ["↑↓", "move"],
  ["←→", "kind"],
  ["space", "select"],
  ["r", "recommended"],
  ["tab", "expand"],
  ["enter", "review"],
  ["esc", "quit"],
];
const CONFIRM_KEYS: Keys = [
  ["y", "remove", "red"],
  ["esc", "back"],
  ["q", "quit"],
  ["↑↓", "scroll"],
];
const SUMMARY_KEYS: Keys = [
  ["↑↓", "scroll"],
  ["esc", "quit"],
];

export function App({ report, configDir, backupDir, now, dryRun, cleanup }: AppProps) {
  const installations = useMemo(() => groupedByUsageStatus(report.installations), [report]);
  const tabs = useMemo(() => kindTabsOf(installations), [installations]);
  const { exit } = useApp();
  const { columns, rows } = useWindowSize();
  const [state, dispatch] = useReducer(reducerFor(installations, tabs, dryRun), INITIAL_STATE);
  const { screen, pageTop, selection } = state;
  const shownInstallations = installations.filter(tabs[state.tab]!.includes);
  const listTop = useRef(0);

  const selected = installations.filter((installation) => selection.has(idOf(installation)));

  const header: Line[] = [
    {
      key: "title",
      content: (
        <>
          <Text bold>declaw</Text>
          <Text dimColor>{`  ${formatPeriodLine(report.period)}`}</Text>
        </>
      ),
    },
  ];

  useEffect(() => {
    if (screen !== "running") return;
    void cleanup(selected).then((outcomes) => dispatch({ type: "finished", outcomes }));
  }, [screen]);

  const body = bodyOf(state, shownInstallations, () => planCleanup(selected, { configDir, backupDir }), {
    dryRun,
    now,
    table: columnsFor(installations, now, columns),
    tabs: tabBar(tabs, state.tab, installations),
    problems: formatSources(report.sources, { problemsOnly: true }),
  });
  const footer = footerOf(state, dryRun);

  const fixedHeight = header.length + body.header.length + footer.length;
  const detailContext = { periodStart: report.period.start, configDir, backupDir };
  const panelHeight = useMemo(
    () => Math.max(0, ...installations.map((installation) => detailLines(installation, detailContext).length)) + 2,
    [installations, configDir, backupDir],
  );
  const current =
    screen === "list"
      ? shownInstallations[listRowsOf(shownInstallations, state.expanded)[state.cursor]?.index ?? -1]
      : undefined;
  const panel = current && rows - 1 - fixedHeight - panelHeight >= MIN_LIST_ROWS ? current : undefined;
  const gap: Line[] = screen === "list" && !panel ? [{ key: "panel gap", content: "" }] : [];
  const room = Math.max(3, rows - 1 - fixedHeight - (panel ? panelHeight : gap.length));
  const heights = body.lines.map(() => 1);

  let top: number;
  if (screen === "list") {
    top = followFocus(heights, body.focus, body.focusEnd ?? body.focus, room, listTop.current);
    listTop.current = top;
  } else {
    top = Math.min(pageTop, lastTop(heights, room));
  }
  const view = windowFrom(heights, top, room);

  useInput((input, key) => {
    if (key.escape) {
      if (screen === "confirm") dispatch({ type: "back" });
      else if (screen !== "running") exit();
    } else if (key.upArrow) dispatch({ type: "up", lastPageTop: lastTop(heights, room) });
    else if (key.downArrow) dispatch({ type: "down", lastPageTop: lastTop(heights, room) });
    else if (key.rightArrow) dispatch({ type: "tab", step: 1 });
    else if (key.leftArrow) dispatch({ type: "tab", step: -1 });
    else if (key.tab) dispatch({ type: "expand" });
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
    ...(view.above > 0 ? [{ key: "above", content: `  ↑ ${view.above} more`, style: "dim" as const }] : []),
    ...body.lines.slice(view.start, view.end),
    ...(view.below > 0 ? [{ key: "below", content: `  ↓ ${view.below} more`, style: "dim" as const }] : []),
  ];

  return (
    <Box flexDirection="column">
      {[...header, ...body.header, ...shown, ...gap].map(renderLine)}
      {panel && (
        <DetailPanel lines={detailLines(panel, detailContext)} height={panelHeight - 2} width={columns} />
      )}
      {footer.map(renderLine)}
    </Box>
  );
}

const MIN_LIST_ROWS = 6;

function renderLine(line: Line): ReactNode {
  if (line.element !== undefined) return <Box key={line.key}>{line.element}</Box>;
  return (
    <Text
      key={line.key}
      wrap={line.wrap ?? "truncate-end"}
      bold={line.style === "bold"}
      dimColor={line.style === "dim"}
      {...(line.style === "warning" && { color: "yellow" })}
    >
      {line.content === "" || line.content === undefined ? " " : line.content}
    </Text>
  );
}

function keyBar(keys: Keys): ReactNode {
  return keys.map(([key, label, color], index) => (
    <Text key={key}>
      {index > 0 && "  "}
      <Text bold {...(color && { color })}>
        {key}
      </Text>
      <Text dimColor>{` ${label}`}</Text>
    </Text>
  ));
}

interface State {
  screen: Screen;
  tab: number;
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
  | { type: "tab"; step: number }
  | { type: "expand" }
  | { type: "toggle" }
  | { type: "select-recommended" }
  | { type: "review" }
  | { type: "proceed" }
  | { type: "finished"; outcomes: CleanupOutcome[] }
  | { type: "back" };

const INITIAL_STATE: State = {
  screen: "list",
  tab: 0,
  cursor: 0,
  pageTop: 0,
  outcomes: [],
  needsSelection: false,
  selection: new Set(),
  expanded: new Set(),
};

function reducerFor(allInstallations: Installation[], tabs: KindTab[], dryRun: boolean) {
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
    const installations = allInstallations.filter(tabs[state.tab]!.includes);
    const listRows = listRowsOf(installations, state.expanded);
    const current = installations[listRows[state.cursor]?.index ?? -1];
    switch (action.type) {
      case "tab":
        return { ...state, tab: (state.tab + action.step + tabs.length) % tabs.length, cursor: 0 };
      case "up":
        return { ...state, cursor: Math.max(0, state.cursor - 1) };
      case "down":
        return { ...state, cursor: Math.min(listRows.length - 1, state.cursor + 1) };
      case "expand": {
        if (!current) return state;
        const expanded = withId(state.expanded, idOf(current), !state.expanded.has(idOf(current)));
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
          selection: withId(state.selection, idOf(current), !state.selection.has(idOf(current))),
        };
      case "select-recommended":
        return {
          ...state,
          needsSelection: false,
          selection: new Set([
            ...state.selection,
            ...installations.filter((i) => i.recommended).map(idOf),
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

function withId(ids: ReadonlySet<string>, id: string, present: boolean): ReadonlySet<string> {
  const next = new Set(ids);
  if (present) next.add(id);
  else next.delete(id);
  return next;
}

interface Body {
  header: Line[];
  lines: Line[];
  focus: number;
  focusEnd?: number;
}

interface Layout {
  dryRun: boolean;
  now: Date;
  table: Columns;
  tabs: ReactNode;
  problems: string[];
}

function listLines(
  installations: Installation[],
  { cursor, selection, expanded }: State,
  { now, table: columns, tabs, problems }: Layout,
): Body {
  const listRows = listRowsOf(installations, expanded);
  const lines: Line[] = [];
  let focus = 0;
  let focusEnd = 0;
  listRows.forEach((listRow, row) => {
    const installation = installations[listRow.index]!;
    const onCursor = row === cursor;
    const previous = listRows[row - 1];
    if (!isChild(listRow) && installations[previous?.index ?? -1]?.usageStatus !== installation.usageStatus) {
      const status = installation.usageStatus;
      if (lines.length > 0) lines.push({ key: `${status} gap`, content: "" });
      if (onCursor) focus = lines.length;
      lines.push({
        key: status,
        content: groupHeader(status, installations.filter((i) => i.usageStatus === status).length),
      });
    } else if (onCursor) {
      focus = lines.length;
    }
    if (onCursor || (focusEnd === lines.length - 1 && row > cursor && isChild(listRow) && !isChild(listRows[cursor]))) {
      focusEnd = lines.length;
    }
    if (listRow.hooks && installation.kind === "plugin") {
      lines.push({ key: `${idOf(installation)} hooks`, content: hooksLine(installation.hooks, onCursor) });
    } else if (listRow.component !== undefined) {
      const component = installation.kind === "plugin" ? installation.components[listRow.component] : undefined;
      lines.push({
        key: `${idOf(installation)} ${component ? `${component.kind} ${component.name}` : "none"}`,
        content: componentLine(component, { onCursor, columns, now }),
      });
    } else {
      lines.push({
        key: idOf(installation),
        content: installationLine(installation, {
          onCursor,
          selected: selection.has(idOf(installation)),
          columns,
          now,
        }),
      });
    }
  });
  return {
    header: [
      { key: "tabs", content: tabs },
      {
        key: "counts",
        element: (
          <>
            <Box flexGrow={1} flexShrink={1}>
              <Text wrap="truncate-end">{countsLine(installations)}</Text>
            </Box>
            <Box flexShrink={0} marginLeft={2}>
              <Text bold={selection.size > 0} dimColor={selection.size === 0}>
                {`${selection.size} selected`}
              </Text>
            </Box>
          </>
        ),
      },
      ...problems.map((text): Line => ({ key: text, content: text, style: "warning" })),
      { key: "columns", content: columnHeader(columns) },
    ],
    lines,
    focus,
    focusEnd,
  };
}

function bodyOf(state: State, installations: Installation[], plan: () => PlannedAction[], layout: Layout): Body {
  switch (state.screen) {
    case "list":
      return listLines(installations, state, layout);
    case "confirm": {
      const planned = plan();
      return {
        header: [
          { key: "heading gap", content: "" },
          { key: "heading", content: confirmHeading(planned.length, layout.dryRun) },
          { key: "lines gap", content: "" },
        ],
        lines: confirmLines(planned),
        focus: 0,
      };
    }
    case "running":
      return {
        header: [{ key: "running gap", content: "" }],
        lines: [
          {
            key: "running",
            element: <Spinner label={`Removing ${countOf(state.selection.size, "Installation")}…`} />,
          },
        ],
        focus: 0,
      };
    case "summary":
      return {
        header: [
          { key: "heading gap", content: "" },
          { key: "heading", content: summaryHeading(state.outcomes) },
          { key: "lines gap", content: "" },
        ],
        lines: summaryLines(state.outcomes),
        focus: 0,
      };
  }
}

function footerOf(state: State, dryRun: boolean): Line[] {
  switch (state.screen) {
    case "list":
      return [
        ...(state.needsSelection
          ? [{ key: "hint", content: "Select at least one Installation to review.", style: "warning" as const }]
          : []),
        { key: "keys", content: keyBar(LIST_KEYS) },
      ];
    case "confirm":
      return [
        { key: "keys gap", content: "" },
        { key: "keys", content: keyBar(dryRun ? CONFIRM_KEYS.slice(1) : CONFIRM_KEYS) },
      ];
    case "running":
      return [];
    case "summary":
      return [
        { key: "keys gap", content: "" },
        {
          key: "keys",
          content: (
            <>
              {keyBar(SUMMARY_KEYS)}
              <Text dimColor>  · the summary stays in the terminal after you quit</Text>
            </>
          ),
        },
      ];
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
