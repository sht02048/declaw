import { render } from "ink";
import type { InteractiveSession } from "../cli/main.js";
import { formatCleanupSummary } from "../cli/summary.js";
import { claudeCliRunner } from "../claude-cli.js";
import { cleanup, type CleanupOutcome } from "../engine/index.js";
import { systemTrash } from "../system-effects.js";
import { App } from "./app.js";

export async function runInteractive({
  report,
  configDir,
  configFile,
  backupDir,
  dryRun,
}: InteractiveSession): Promise<number> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write(
      "declaw needs an interactive terminal. Run `declaw stats` to print Usage Stats instead.\n",
    );
    return 1;
  }
  const runClaude = claudeCliRunner();
  const outcomes: CleanupOutcome[] = [];
  const instance = render(
    <App
      report={report}
      configDir={configDir}
      backupDir={backupDir}
      now={new Date()}
      dryRun={dryRun}
      cleanup={async (selection) => {
        const run = await cleanup(selection, { configDir, configFile, backupDir, trash: systemTrash, runClaude });
        outcomes.push(...run);
        return run;
      }}
    />,
    { alternateScreen: true },
  );
  await instance.waitUntilExit();
  if (outcomes.length > 0) process.stdout.write(formatCleanupSummary(outcomes));
  return 0;
}
