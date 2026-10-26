import { Text } from "ink";
import type { ReactNode } from "react";
import { isRemovable, type Component, type Installation, type UsageStatus } from "../engine/index.js";
import { formatHooksPerSession, installNote, USAGE_STATUS_LABELS } from "../cli/format.js";
import { fit, formatLastUseAgo } from "./text.js";

export interface ListRow {
  index: number;
  component?: number;
  hooks?: true;
}

export function listRowsOf(installations: Installation[], expanded: ReadonlySet<string>): ListRow[] {
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

export function isChild(listRow: ListRow | undefined): boolean {
  return listRow?.component !== undefined || listRow?.hooks === true;
}

export const ACCENT = "cyan";

export const STATUS_ORDER: UsageStatus[] = ["unused", "used", "unknown"];

export const STATUS_COLORS: Record<UsageStatus, string> = {
  unused: "yellow",
  used: "green",
  unknown: "gray",
};

export function groupedByUsageStatus(installations: Installation[]): Installation[] {
  return STATUS_ORDER.flatMap((status) => installations.filter((i) => i.usageStatus === status));
}

export function countsLine(installations: Installation[]): ReactNode {
  const counts = STATUS_ORDER.map((status) => ({
    status,
    count: installations.filter((i) => i.usageStatus === status).length,
  })).filter(({ status, count }) => status !== "unknown" || count > 0);
  const recommended = installations.filter((i) => i.recommended).length;
  return (
    <>
      {counts.map(({ status, count }, index) => (
        <Text key={status} color={STATUS_COLORS[status]}>
          {index > 0 && "  "}
          {`${count} ${USAGE_STATUS_LABELS[status]}`}
        </Text>
      ))}
      <Text dimColor>{` · ${recommended} recommended`}</Text>
    </>
  );
}

export function groupHeader(status: UsageStatus, count: number): ReactNode {
  return (
    <Text color={STATUS_COLORS[status]}>
      {"  "}
      <Text bold>{USAGE_STATUS_LABELS[status]}</Text>
      {`  ${count}`}
    </Text>
  );
}

interface Kind {
  label: string;
  color: string;
}

export function shortKind(installation: Installation): Kind {
  if (installation.kind === "plugin") return { label: "plugin", color: "magenta" };
  if (installation.linked?.broken) return { label: "broken link", color: "red" };
  if (installation.linked) return { label: "link", color: "cyan" };
  if (installation.synced) return { label: "synced", color: "gray" };
  return { label: "skill", color: "blue" };
}

interface Cells {
  name: string;
  tag: string;
  kind: string;
  uses: string;
  lastUse: string;
  hooks: string;
}

function installationCells(installation: Installation, now: Date): Cells {
  return {
    name: installation.name,
    tag: installation.kind === "plugin" ? installNote(installation) : "",
    kind: shortKind(installation).label,
    uses: String(installation.uses),
    lastUse: formatLastUseAgo(installation.lastUse, now),
    hooks: installation.kind === "plugin" ? String(installation.hooks) : "",
  };
}

function componentCells(component: Component, now: Date): Cells {
  return {
    name: `├─ ${component.name}`,
    tag: "",
    kind: component.kind,
    uses: String(component.uses),
    lastUse: formatLastUseAgo(component.lastUse, now),
    hooks: "",
  };
}

const PREFIX = 6;
const GAP = 2;

export interface Columns {
  name: number;
  kind: number | null;
  uses: number;
  lastUse: number;
  hooks: number | null;
}

export function columnsFor(installations: Installation[], now: Date, width: number): Columns {
  const cells = installations.flatMap((installation) => [
    installationCells(installation, now),
    ...(installation.kind === "plugin" ? installation.components.map((c) => componentCells(c, now)) : []),
  ]);
  const widest = (header: string, cell: (cells: Cells) => string) =>
    Math.max(header.length, ...cells.map((row) => cell(row).length));
  const kind = width >= 60 ? widest("kind", (row) => row.kind) : null;
  const uses = widest("uses", (row) => row.uses);
  const lastUse = widest("last use", (row) => row.lastUse);
  const hooks =
    width >= 80 && installations.some((installation) => installation.kind === "plugin")
      ? widest("hooks", (row) => row.hooks)
      : null;
  const fixed = [kind, uses, lastUse, hooks].reduce<number>((sum, w) => sum + (w === null ? 0 : GAP + w), PREFIX);
  const name = Math.max(1, Math.min(widest("name", (row) => (row.tag ? `${row.name}  ${row.tag}` : row.name)), width - fixed));
  return { name, kind, uses, lastUse, hooks };
}

export function columnHeader(columns: Columns): ReactNode {
  return (
    <Text dimColor>
      {" ".repeat(PREFIX)}
      {"name".padEnd(columns.name)}
      {trailingCells(columns, { kind: "kind", uses: "uses", lastUse: "last use", hooks: "hooks" })}
    </Text>
  );
}

function trailingCells(
  columns: Columns,
  cells: Pick<Cells, "kind" | "uses" | "lastUse" | "hooks">,
  kindColor?: string,
): ReactNode {
  const gap = " ".repeat(GAP);
  return (
    <>
      {columns.kind !== null && (
        <>
          {gap}
          <Text {...(kindColor && { color: kindColor })}>{cells.kind.padEnd(columns.kind)}</Text>
        </>
      )}
      {gap}
      {cells.uses.padStart(columns.uses)}
      {gap}
      <Text dimColor>{cells.lastUse.padEnd(columns.lastUse)}</Text>
      {columns.hooks !== null && (
        <>
          {gap}
          {cells.hooks.padStart(columns.hooks)}
        </>
      )}
    </>
  );
}

function cursorGlyph(onCursor: boolean): ReactNode {
  return onCursor ? (
    <Text color={ACCENT} bold>
      ›
    </Text>
  ) : (
    " "
  );
}

function selectionGlyph(installation: Installation, selected: boolean): ReactNode {
  if (!isRemovable(installation)) return <Text dimColor>·</Text>;
  return selected ? <Text color="green">◉</Text> : "○";
}

export function installationLine(
  installation: Installation,
  { onCursor, selected, columns, now }: { onCursor: boolean; selected: boolean; columns: Columns; now: Date },
): ReactNode {
  const cells = installationCells(installation, now);
  const tag = cells.tag !== "" && cells.name.length + GAP + cells.tag.length <= columns.name ? `  ${cells.tag}` : "";
  const name = tag ? cells.name : fit(cells.name, columns.name).trimEnd();
  return (
    <Text>
      {cursorGlyph(onCursor)} {selectionGlyph(installation, selected)}{" "}
      {installation.recommended ? <Text color="yellow">★</Text> : " "}{" "}
      <Text bold={onCursor}>{name}</Text>
      {tag && <Text dimColor>{tag}</Text>}
      {" ".repeat(columns.name - name.length - tag.length)}
      {trailingCells(columns, cells, shortKind(installation).color)}
    </Text>
  );
}

export function componentLine(
  component: Component | undefined,
  { onCursor, columns, now }: { onCursor: boolean; columns: Columns; now: Date },
): ReactNode {
  if (!component) {
    return (
      <Text>
        {cursorGlyph(onCursor)}
        {"     "}
        <Text dimColor>├─ no Components found</Text>
      </Text>
    );
  }
  const cells = componentCells(component, now);
  return (
    <Text>
      {cursorGlyph(onCursor)}
      {"     "}
      <Text dimColor>
        {fit(cells.name, columns.name)}
        {trailingCells(columns, cells)}
      </Text>
    </Text>
  );
}

export function hooksLine(hooks: number | "unknown", onCursor: boolean): ReactNode {
  return (
    <Text>
      {cursorGlyph(onCursor)}
      {"     "}
      <Text dimColor>└─ {formatHooksPerSession(hooks)}</Text>
    </Text>
  );
}
