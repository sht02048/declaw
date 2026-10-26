import { resolveConfigDir, resolveConfigFile } from "../config-dir.js";
import { report, type Report } from "../engine/index.js";
import { formatStatsJson, formatStatsText } from "./stats.js";

export interface InteractiveSession {
  report: Report;
  configDir: string;
  dryRun: boolean;
}

export interface CliContext {
  env: Record<string, string | undefined>;
  homeDir: string;
  now: () => Date;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  interactive: (session: InteractiveSession) => Promise<number>;
}

const USAGE = "Usage: declaw [--dry-run]\n       declaw stats [--json]\n";

export async function run(argv: string[], context: CliContext): Promise<number> {
  const configDir = resolveConfigDir(context.env, context.homeDir);
  const configFile = resolveConfigFile(context.env, context.homeDir);
  const [command, ...flags] = argv;

  if (command === "stats") {
    const result = await report({ configDir, configFile, now: context.now() });
    context.stdout(flags.includes("--json") ? formatStatsJson(result) : formatStatsText(result));
    return 0;
  }
  if (argv.every((flag) => flag === "--dry-run")) {
    const result = await report({ configDir, configFile, now: context.now() });
    return context.interactive({ report: result, configDir, dryRun: argv.includes("--dry-run") });
  }
  context.stderr(USAGE);
  return 1;
}
