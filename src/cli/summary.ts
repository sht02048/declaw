import type { CleanupOutcome } from "../engine/index.js";

const OUTCOME_LABELS: Record<CleanupOutcome["outcome"], string> = {
  removed: "removed",
  failed: "failed",
  "not-implemented": "skipped",
};

export function formatCleanupSummary(outcomes: CleanupOutcome[]): string {
  const count = (outcome: CleanupOutcome["outcome"]) =>
    outcomes.filter((candidate) => candidate.outcome === outcome).length;
  const lines = [
    `Cleanup of ${outcomes.length} ${outcomes.length === 1 ? "Installation" : "Installations"}: ` +
      `${count("removed")} removed, ${count("failed")} failed`,
    "",
  ];
  for (const outcome of outcomes) {
    lines.push(`${OUTCOME_LABELS[outcome.outcome].padEnd(8)} ${outcome.name}`);
    if (outcome.outcome === "failed" && outcome.output !== "") lines.push(outcome.output.replace(/\n$/, ""));
  }
  const reinstallCommands = outcomes.flatMap(({ action, outcome }) =>
    outcome === "removed" && action.kind === "uninstall-plugin" ? [`  ${action.reinstallCommand}`] : [],
  );
  if (reinstallCommands.length > 0) lines.push("", "To reinstall a removed Plugin:", ...reinstallCommands);
  return `${lines.join("\n")}\n`;
}
