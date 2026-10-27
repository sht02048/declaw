import type { CleanupOutcome, PlannedAction } from "../engine/index.js";
import { countOf } from "../plural.js";
import { actionText, UNDO_HEADINGS, UNDO_NOTES } from "./actions.js";

export function formatCleanupSummary(outcomes: CleanupOutcome[]): string {
  const removed = outcomes.filter((outcome) => outcome.result === "removed");
  const lines = [
    `Cleanup of ${countOf(outcomes.length, "Installation")}: ` +
      `${removed.length} removed, ${outcomes.length - removed.length} failed`,
    "",
  ];
  for (const outcome of outcomes) {
    lines.push(`${outcome.result.padEnd(8)} ${outcome.name}`);
    if (outcome.result === "failed" && outcome.message !== "") lines.push(outcome.message.replace(/\n$/, ""));
  }
  for (const kind of Object.keys(UNDO_HEADINGS) as PlannedAction["kind"][]) {
    const undos = removed.flatMap(({ action }) => (action.kind === kind ? [`  ${actionText(action).undoInSummary}`] : []));
    if (undos.length === 0) continue;
    lines.push("", UNDO_HEADINGS[kind], ...undos);
    if (UNDO_NOTES[kind]) lines.push(UNDO_NOTES[kind]);
  }
  return `${lines.join("\n")}\n`;
}
