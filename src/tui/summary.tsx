import { Text } from "ink";
import type { CleanupOutcome } from "../engine/index.js";
import { actionText, undoGroups } from "../cli/actions.js";
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
      key: `outcome ${outcome.action.kind} ${outcome.name}`,
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
          lines.push({ key: `message ${outcome.action.kind} ${outcome.name} ${index}`, content: <Text dimColor>{`    ${line}`}</Text> }),
        );
    }
  }
  const removed = outcomes.flatMap((outcome) => (outcome.result === "removed" ? [outcome.action] : []));
  for (const { kind, heading, actions, note } of undoGroups(removed)) {
    lines.push({ key: `${kind} gap`, content: "" }, { key: kind, content: <Text bold>{heading}</Text> });
    for (const action of actions) {
      lines.push({ key: `undo ${kind} ${action.name}`, wrap: "truncate-middle", content: `  ${actionText(action).undoInSummary}` });
    }
    if (note) lines.push({ key: `${kind} note`, content: note });
  }
  return lines;
}
