import type { CleanupOutcome, PlannedAction } from "../engine/index.js";

const UNDO_HEADINGS: Record<PlannedAction["kind"], string> = {
  "uninstall-plugin": "To reinstall a removed Plugin:",
  "remove-link": "To restore a removed Linked Skill:",
  "move-to-trash": "Moved to the system trash, where they can be restored:",
};

export function formatCleanupSummary(outcomes: CleanupOutcome[]): string {
  const removed = outcomes.filter((outcome) => outcome.result === "removed");
  const lines = [
    `Cleanup of ${outcomes.length} ${outcomes.length === 1 ? "Installation" : "Installations"}: ` +
      `${removed.length} removed, ${outcomes.length - removed.length} failed`,
    "",
  ];
  for (const outcome of outcomes) {
    lines.push(`${outcome.result.padEnd(8)} ${outcome.name}`);
    if (outcome.result === "failed" && outcome.message !== "") lines.push(outcome.message.replace(/\n$/, ""));
  }
  for (const kind of Object.keys(UNDO_HEADINGS) as PlannedAction["kind"][]) {
    const undos = removed.flatMap(({ action }) => (action.kind === kind ? [`  ${undoOf(action)}`] : []));
    if (undos.length > 0) lines.push("", UNDO_HEADINGS[kind], ...undos);
  }
  return `${lines.join("\n")}\n`;
}

function undoOf(action: PlannedAction): string {
  switch (action.kind) {
    case "uninstall-plugin":
      return action.reinstallCommand;
    case "remove-link":
      return action.relinkCommand;
    case "move-to-trash":
      return action.path;
  }
}
