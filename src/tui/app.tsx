import { Box, Text, useApp, useInput } from "ink";
import { useState } from "react";
import {
  isRemovable,
  planCleanup,
  type Installation,
  type PlannedAction,
  type Plugin,
  type Report,
} from "../engine/index.js";
import { formatLastUse, formatPeriod, kindLabel, note, STATUS_LABELS } from "../cli/format.js";

export interface AppProps {
  report: Report;
  configDir: string;
  dryRun: boolean;
}

type Screen = "list" | "confirm";

export function App({ report, configDir, dryRun }: AppProps) {
  const { installations } = report;
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>("list");
  const [cursor, setCursor] = useState(0);
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

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

  useInput((input, key) => {
    if (input === "q") {
      exit();
      return;
    }
    if (screen === "confirm") {
      if (key.escape) setScreen("list");
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
    } else if (key.return && selected.length > 0) setScreen("confirm");
  });

  return (
    <Box flexDirection="column">
      <Text bold>{formatPeriod(report.period)}</Text>
      {screen === "list" ? (
        <List
          installations={installations}
          cursor={cursor}
          selection={selection}
          expanded={expanded}
        />
      ) : (
        <Confirmation plan={planCleanup(selected, { configDir })} dryRun={dryRun} />
      )}
    </Box>
  );
}

interface ListProps {
  installations: Installation[];
  cursor: number;
  selection: ReadonlySet<string>;
  expanded: ReadonlySet<string>;
}

function List({ installations, cursor, selection, expanded }: ListProps) {
  const rows = installations.map((installation) => [
    STATUS_LABELS[installation.status],
    kindLabel(installation),
    installation.name,
    String(installation.uses),
    formatLastUse(installation.lastUse),
    note(installation),
  ]);
  const widths = columnWidths(rows);
  return (
    <Box flexDirection="column">
      {rows.map((row, index) => {
        const installation = installations[index]!;
        const marker = index === cursor ? ">" : " ";
        const checkbox = !isRemovable(installation)
          ? "   "
          : selection.has(installation.name)
            ? "[x]"
            : "[ ]";
        const recommended = installation.recommended ? "*" : " ";
        return (
          <Box key={installation.name} flexDirection="column">
            <Text inverse={index === cursor}>
              {`${marker} ${checkbox} ${recommended} ${alignRow(row, widths)}`}
            </Text>
            {installation.kind === "plugin" && expanded.has(installation.name) && (
              <ComponentRows plugin={installation} />
            )}
          </Box>
        );
      })}
      <Text> </Text>
      <Text dimColor>* recommended for Cleanup</Text>
      <Text dimColor>
        up/down move · space select · r select recommended · right/left expand · enter review · q quit
      </Text>
    </Box>
  );
}

function ComponentRows({ plugin }: { plugin: Plugin }) {
  if (plugin.components.length === 0) return <Text dimColor>{"        no Components found"}</Text>;
  const rows = plugin.components.map((component) => [
    component.kind,
    component.name,
    String(component.uses),
    formatLastUse(component.lastUse),
  ]);
  const widths = columnWidths(rows);
  return (
    <>
      {rows.map((row) => (
        <Text key={`${row[0]} ${row[1]}`} dimColor>
          {`        ${alignRow(row, widths)}`}
        </Text>
      ))}
    </>
  );
}

function Confirmation({ plan, dryRun }: { plan: PlannedAction[]; dryRun: boolean }) {
  return (
    <Box flexDirection="column">
      <Text> </Text>
      <Text>{`Review the Cleanup of ${plan.length} ${plan.length === 1 ? "Installation" : "Installations"}:`}</Text>
      {plan.map((action) => (
        <Box key={action.name} flexDirection="column" marginTop={1}>
          <Text bold>{action.name}</Text>
          <Text>{`  ${describe(action)}`}</Text>
          <Text dimColor>{`  Undo: ${undo(action)}`}</Text>
        </Box>
      ))}
      <Text> </Text>
      {dryRun && <Text>Dry run: nothing will be changed.</Text>}
      <Text dimColor>esc back to the list · q quit</Text>
    </Box>
  );
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

function columnWidths(rows: string[][]): number[] {
  return (rows[0] ?? []).map((_, column) => Math.max(...rows.map((row) => row[column]!.length)));
}

function alignRow(row: string[], widths: number[]): string {
  return row
    .map((cell, column) => cell.padEnd(widths[column]!))
    .join("  ")
    .trimEnd();
}
