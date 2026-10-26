import { Box, Text } from "ink";
import type { Report } from "../engine/index.js";
import { formatLastUse, formatPeriod, kindLabel, note, STATUS_LABELS } from "../cli/format.js";

export interface AppProps {
  report: Report;
  configDir: string;
  dryRun: boolean;
}

export function App({ report }: AppProps) {
  const rows = report.installations.map((installation) => [
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
      {rows.map((row, index) => (
        <Text key={report.installations[index]!.name}>{alignRow(row, widths)}</Text>
      ))}
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
