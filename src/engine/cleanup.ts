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

export async function cleanup(selection: Installation[], options: CleanupOptions): Promise<CleanupOutcome[]> {
  const outcomes: CleanupOutcome[] = [];
  for (const action of planCleanup(selection, options)) {
    try {
      await perform(action, options);
      outcomes.push({ name: action.name, action, result: "removed" });
    } catch (error) {
      outcomes.push({ name: action.name, action, result: "failed", message: messageOf(error) });
    }
  }
  return outcomes;
}

async function perform(action: PlannedAction, { trash }: CleanupOptions): Promise<void> {
  switch (action.kind) {
    case "remove-link":
      if ((await lstat(action.path)).isSymbolicLink()) await unlink(action.path);
      return;
    case "move-to-trash":
      await trash(action.path);
      return;
    case "uninstall-plugin":
      return;
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
