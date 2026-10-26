import type { Installation } from "./index.js";
import { planCleanup, type PlannedAction, type UninstallPlugin } from "./plan.js";

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
  | { name: string; action: PlannedAction; outcome: "failed"; output: string }
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
    outcomes.push({ name: action.name, action, ...(await uninstall(action, claude)) });
  }
  return outcomes;
}

async function uninstall(
  action: UninstallPlugin,
  claude: ClaudeRunner,
): Promise<{ outcome: "removed" } | { outcome: "failed"; output: string }> {
  let run: ClaudeRun;
  try {
    run = await claude(["plugin", "uninstall", action.name, "--scope", action.scope]);
  } catch (error) {
    return { outcome: "failed", output: error instanceof Error ? error.message : String(error) };
  }
  return run.exitCode === 0 ? { outcome: "removed" } : { outcome: "failed", output: run.output };
}
