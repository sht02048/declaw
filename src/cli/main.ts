import { resolveConfigDir } from "../config-dir.js";
import { report } from "../engine/index.js";
import { formatStatsJson, formatStatsText } from "./stats.js";

export interface CliContext {
  env: Record<string, string | undefined>;
  homeDir: string;
  now: () => Date;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export async function run(argv: string[], context: CliContext): Promise<number> {
  const [command, ...flags] = argv;
  if (command !== "stats") {
    context.stderr("Usage: declaw stats [--json]\n");
    return 1;
  }
  const configDir = resolveConfigDir(context.env, context.homeDir);
  const result = await report({ configDir, now: context.now() });
  context.stdout(flags.includes("--json") ? formatStatsJson(result) : formatStatsText(result));
  return 0;
}
