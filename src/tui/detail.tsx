import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { isRemovable, planCleanup, type Installation } from "../engine/index.js";
import { actionText } from "../cli/actions.js";
import { formatDate, formatHooksPerSession, installNote, kindLabel, USAGE_STATUS_LABELS } from "../cli/format.js";
import { countOf } from "../plural.js";
import { STATUS_COLORS } from "./list.js";

export interface DetailContext {
  periodStart: Date | null;
  configDir: string;
}

interface DetailLine {
  key: string;
  content: ReactNode;
  wrap: "truncate-end" | "truncate-middle";
}

export function detailLines(installation: Installation, context: DetailContext): DetailLine[] {
  const note = installation.kind === "plugin" ? installNote(installation) : "";
  const facts = [
    installation.installedAt && `Installed ${formatDate(installation.installedAt)}`,
    installation.kind === "plugin" && formatHooksPerSession(installation.hooks),
  ].filter((fact) => typeof fact === "string");
  const lines: (DetailLine | false)[] = [
    {
      key: "name",
      wrap: "truncate-end",
      content: (
        <>
          <Text bold>{installation.name}</Text>
          <Text dimColor>{`  ${kindLabel(installation)}${note && ` · ${note}`}`}</Text>
          {installation.recommended && <Text color="yellow">  ★ recommended for Cleanup</Text>}
        </>
      ),
    },
    {
      key: "status",
      wrap: "truncate-end",
      content: (
        <>
          <Text bold color={STATUS_COLORS[installation.usageStatus]}>
            {USAGE_STATUS_LABELS[installation.usageStatus]}
          </Text>
          {`  ${statusReason(installation, context)}`}
        </>
      ),
    },
    facts.length > 0 && { key: "facts", wrap: "truncate-end", content: <Text dimColor>{facts.join(" · ")}</Text> },
    installation.kind === "standalone-skill" &&
      installation.linked !== undefined && {
        key: "link",
        wrap: "truncate-middle",
        content: `${installation.linked.broken ? "Broken link" : "Links"} to ${installation.linked.target}`,
      },
    installation.kind === "standalone-skill" &&
      installation.synced === true && {
        key: "synced",
        wrap: "truncate-end",
        content: "Managed by claude.ai, cannot be removed",
      },
    isRemovable(installation) && {
      key: "cleanup",
      wrap: "truncate-middle",
      content: (
        <Text dimColor>
          {`Cleanup: ${actionText(planCleanup([installation], { configDir: context.configDir })[0]!).describe}`}
        </Text>
      ),
    },
  ];
  return lines.filter((line) => line !== false);
}

function statusReason(installation: Installation, { periodStart }: DetailContext): string {
  switch (installation.usageStatus) {
    case "unused":
      return periodStart === null ? "No Use known" : `No Use since ${formatDate(periodStart)}`;
    case "used": {
      const { lastUse, uses } = installation;
      const last = lastUse instanceof Date ? `Last used ${formatDate(lastUse)}` : "Used";
      return typeof uses === "number" ? `${last}, ${countOf(uses, "Use")} in the covered period` : last;
    }
    case "unknown":
      return "Last Use cannot be known, a data source is unreadable";
  }
}

export function DetailPanel({ lines, height, width }: { lines: DetailLine[]; height: number; width: number }) {
  return (
    <Box borderStyle="round" borderDimColor flexDirection="column" paddingX={1} height={height + 2} width={width}>
      {lines.map((line) => (
        <Text key={line.key} wrap={line.wrap}>
          {line.content}
        </Text>
      ))}
    </Box>
  );
}
