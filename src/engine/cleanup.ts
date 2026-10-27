import { lstat, mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Installation } from "./index.js";
import { readMcpServerRegistration } from "./mcp-servers.js";
import { planCleanup, type PlannedAction, type PlanOptions, type RemoveMcpServer } from "./plan.js";

export type TrashMover = (path: string) => Promise<void>;

export interface ClaudeRunResult {
  exitCode: number;
  output: string;
}

export type ClaudeRunner = (args: string[]) => Promise<ClaudeRunResult>;

export interface CleanupOptions extends PlanOptions {
  configFile: string;
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

async function perform(action: PlannedAction, { configFile, trash, runClaude }: CleanupOptions): Promise<void> {
  switch (action.kind) {
    case "remove-link":
      if (!(await lstat(action.path)).isSymbolicLink()) throw new Error(`${action.path} is no longer a link`);
      await unlink(action.path);
      return;
    case "move-to-trash":
      if (!(await lstat(action.path)).isDirectory()) throw new Error(`${action.path} is no longer a folder`);
      await trash(action.path);
      return;
    case "uninstall-plugin": {
      const run = await runClaude(["plugin", "uninstall", action.name, "--scope", action.scope]);
      if (run.exitCode !== 0) throw new Error(run.output);
      return;
    }
    case "remove-mcp-server": {
      await backUp(action, configFile);
      const run = await runClaude(["mcp", "remove", action.name, "--scope", action.scope]);
      if (run.exitCode !== 0) throw new Error(run.output);
      return;
    }
  }
}

async function backUp({ name, backupPath }: RemoveMcpServer, configFile: string): Promise<void> {
  const registration = await readMcpServerRegistration(configFile, name);
  if (registration === undefined) throw new Error(`${name} is no longer registered in User Scope`);
  await mkdir(dirname(backupPath), { recursive: true, mode: 0o700 });
  await writeFile(backupPath, `${JSON.stringify(registration, null, 2)}\n`, { mode: 0o600, flag: "wx" });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
