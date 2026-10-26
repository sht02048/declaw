import { render } from "ink";
import type { InteractiveSession } from "../cli/main.js";
import { claudeCliRunner } from "../claude-cli.js";
import { cleanup } from "../engine/index.js";
import { systemTrash } from "../system-effects.js";
import { App } from "./app.js";

export async function runInteractive({ report, configDir, dryRun }: InteractiveSession): Promise<number> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write(
      "declaw needs an interactive terminal. Run `declaw stats` to print Usage Stats instead.\n",
    );
    return 1;
  }
  const runClaude = claudeCliRunner();
  const instance = render(
    <App
      report={report}
      configDir={configDir}
      dryRun={dryRun}
      cleanup={(selection) => cleanup(selection, { configDir, trash: systemTrash, runClaude })}
    />,
  );
  await instance.waitUntilExit();
  return 0;
}
