import { Text } from "ink";
import type { CleanupOutcome, PlannedAction } from "../engine/index.js";
import { actionText, UNDO_HEADINGS } from "../cli/actions.js";
import { countOf } from "../plural.js";
import type { ScreenLine } from "./confirm.js";

export function summaryHeading(outcomes: CleanupOutcome[]) {
  const removed = outcomes.filter((outcome) => outcome.result === "removed").length;
  return (
    <Text bold>
      {`Cleanup of ${countOf(outcomes.length, "Installation")}: ${removed} removed, ${outcomes.length - removed} failed`}
    </Text>
  );
}

export function summaryLines(outcomes: CleanupOutcome[]): ScreenLine[] {
  const lines: ScreenLine[] = [];
  for (const outcome of outcomes) {
    lines.push({
      key: `outcome ${outcome.name}`,
      content:
        outcome.result === "removed" ? (
          <>
            <Text color="green">✔ removed</Text>
            {`  ${outcome.name}`}
          </>
        ) : (
          <>
            <Text color="red">✖ failed</Text>
            {`   ${outcome.name}`}
          </>
        ),
    });
    if (outcome.result === "failed") {
      outcome.message
        .replace(/\n$/, "")
        .split("\n")
        .filter((line) => line !== "")
        .forEach((line, index) =>
          lines.push({ key: `message ${outcome.name} ${index}`, content: <Text dimColor>{`    ${line}`}</Text> }),
        );
    }
  }
  const removed = outcomes.flatMap((outcome) => (outcome.result === "removed" ? [outcome.action] : []));
  for (const kind of Object.keys(UNDO_HEADINGS) as PlannedAction["kind"][]) {
    const actions = removed.filter((action) => action.kind === kind);
    if (actions.length === 0) continue;
    lines.push({ key: `${kind} gap`, content: "" }, { key: kind, content: <Text bold>{UNDO_HEADINGS[kind]}</Text> });
    for (const action of actions) {
      lines.push({ key: `undo ${action.name}`, wrap: "truncate-middle", content: `  ${actionText(action).undoInSummary}` });
    }
  }
  return lines;
}
