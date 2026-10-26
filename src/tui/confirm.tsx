import { Text } from "ink";
import type { ReactNode } from "react";
import type { PlannedAction } from "../engine/index.js";
import { actionText } from "../cli/actions.js";
import { countOf } from "../plural.js";

export interface ScreenLine {
  key: string;
  content: ReactNode;
  wrap?: "truncate-end" | "truncate-middle";
}

const ACTION_GROUPS: [PlannedAction["kind"], string][] = [
  ["uninstall-plugin", "Uninstall Plugins"],
  ["remove-link", "Remove links"],
  ["move-to-trash", "Move to trash"],
];

export function confirmHeading(count: number, dryRun: boolean): ReactNode {
  return dryRun ? (
    <Text bold color="yellow">
      Dry run: nothing will be changed
    </Text>
  ) : (
    <Text bold color="red">
      {`Remove ${countOf(count, "Installation")}?`}
    </Text>
  );
}

export function confirmLines(plan: PlannedAction[]): ScreenLine[] {
  const lines: ScreenLine[] = [];
  for (const [kind, label] of ACTION_GROUPS) {
    const actions = plan.filter((action) => action.kind === kind);
    if (actions.length === 0) continue;
    if (lines.length > 0) lines.push({ key: `${kind} gap`, content: "" });
    lines.push({ key: kind, content: <Text bold>{`${label} (${actions.length})`}</Text> });
    for (const action of actions) {
      lines.push({
        key: `${kind} ${action.name}`,
        wrap: "truncate-middle",
        content: (
          <>
            {"  "}
            <Text bold>{action.name}</Text>
            <Text dimColor>{`  ${actionText(action).describe}`}</Text>
          </>
        ),
      });
    }
  }
  lines.push({ key: "undo gap", content: "" }, { key: "undo", content: <Text dimColor bold>Undo</Text> });
  for (const [kind] of ACTION_GROUPS) {
    for (const action of plan.filter((planned) => planned.kind === kind)) {
      const { undo } = actionText(action);
      lines.push({
        key: `undo ${action.name}`,
        wrap: "truncate-middle",
        content: <Text dimColor>{`  ${kind === "move-to-trash" ? `${action.name}: ${undo}` : undo}`}</Text>,
      });
    }
  }
  return lines;
}
