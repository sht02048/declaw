import type { CleanupOutcome } from "../engine/index.js";
import { countOf } from "../plural.js";
import { actionText, undoGroups } from "./actions.js";

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
  for (const { heading, actions, note } of undoGroups(removed.map(({ action }) => action))) {
    lines.push("", heading, ...actions.map((action) => `  ${actionText(action).undoInSummary}`));
    if (note) lines.push(note);
  }
  return `${lines.join("\n")}\n`;
}
