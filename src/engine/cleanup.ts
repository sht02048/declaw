import { lstat, unlink } from "node:fs/promises";
import type { Installation } from "./index.js";
import { planCleanup, type PlannedAction } from "./plan.js";

export type TrashMover = (path: string) => Promise<void>;

export interface ClaudeRunResult {
  exitCode: number;
  output: string;
}

export type ClaudeRunner = (args: string[]) => Promise<ClaudeRunResult>;

export interface CleanupOptions {
  configDir: string;
  trash: TrashMover;
  runClaude: ClaudeRunner;
}

export type CleanupOutcome =
  | { name: string; action: PlannedAction; result: "removed" }
  | { name: string; action: PlannedAction; result: "failed"; message: string };

export async function cleanup(
  selection: Installation[],
  { configDir, trash }: CleanupOptions,
): Promise<CleanupOutcome[]> {
  const outcomes: CleanupOutcome[] = [];
  for (const action of planCleanup(selection, { configDir })) {
    if (action.kind === "remove-link" && (await lstat(action.path)).isSymbolicLink()) {
      await unlink(action.path);
      outcomes.push({ name: action.name, action, result: "removed" });
    } else if (action.kind === "move-to-trash") {
      await trash(action.path);
      outcomes.push({ name: action.name, action, result: "removed" });
    }
  }
  return outcomes;
}
