import type { Installation } from "./index.js";
import { planCleanup, type PlannedAction } from "./plan.js";

export interface ClaudeRun {
  exitCode: number;
  output: string;
}

export type ClaudeRunner = (args: string[]) => Promise<ClaudeRun>;

export interface CleanupOptions {
  configDir: string;
  claude: ClaudeRunner;
}

export type CleanupOutcome =
  | { name: string; action: PlannedAction; outcome: "removed" }
  | { name: string; action: PlannedAction; outcome: "not-implemented" };

export async function cleanup(
  selection: Installation[],
  { configDir, claude }: CleanupOptions,
): Promise<CleanupOutcome[]> {
  const outcomes: CleanupOutcome[] = [];
  for (const action of planCleanup(selection, { configDir })) {
    if (action.kind !== "uninstall-plugin") {
      outcomes.push({ name: action.name, action, outcome: "not-implemented" });
      continue;
    }
    await claude(["plugin", "uninstall", action.name, "--scope", action.scope]);
    outcomes.push({ name: action.name, action, outcome: "removed" });
  }
  return outcomes;
}
