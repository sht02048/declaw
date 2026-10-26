import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { isRemovable, type Installation, type Report } from "../engine/index.js";
import { formatLastUse, formatPeriod, kindLabel, note, STATUS_LABELS } from "../cli/format.js";

export interface AppProps {
  report: Report;
  configDir: string;
  dryRun: boolean;
}

export function App({ report }: AppProps) {
  const { installations } = report;
  const [cursor, setCursor] = useState(0);
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());

  const toggle = (installation: Installation) => {
    if (!isRemovable(installation)) return;
    setSelection((current) => {
      const next = new Set(current);
      if (!next.delete(installation.name)) next.add(installation.name);
      return next;
    });
  };

  useInput((input, key) => {
    if (key.upArrow) setCursor((current) => Math.max(0, current - 1));
    else if (key.downArrow) setCursor((current) => Math.min(installations.length - 1, current + 1));
    else if (input === " ") toggle(installations[cursor]!);
    else if (input === "r") {
      setSelection(
        (current) =>
          new Set([...current, ...installations.filter((i) => i.recommended).map((i) => i.name)]),
      );
    }
  });

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
      <Text bold>{formatPeriod(report.period)}</Text>
      {rows.map((row, index) => {
        const installation = installations[index]!;
        const marker = index === cursor ? ">" : " ";
        const checkbox = !isRemovable(installation) ? "   " : selection.has(installation.name) ? "[x]" : "[ ]";
        const recommended = installation.recommended ? "*" : " ";
        return (
          <Text key={installation.name} inverse={index === cursor}>
            {`${marker} ${checkbox} ${recommended} ${alignRow(row, widths)}`}
          </Text>
        );
      })}
    </Box>
  );
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
