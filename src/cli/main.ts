import { join } from "node:path";
import { resolveConfigDir, resolveConfigFile } from "../config-dir.js";
import { report, type Report } from "../engine/index.js";
import { formatStatsJson, formatStatsText } from "./stats.js";

export interface InteractiveSession {
  report: Report;
  configDir: string;
  configFile: string;
  backupDir: string;
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
    const now = context.now();
    const result = await report({ configDir, configFile, now });
    const backupDir = join(context.homeDir, ".declaw", "backups", runTimeOf(now));
    return context.interactive({ report: result, configDir, configFile, backupDir, dryRun: argv.includes("--dry-run") });
  }
  context.stderr(USAGE);
  return 1;
}

function runTimeOf(now: Date): string {
  return `${now.toISOString().slice(0, 19).replaceAll(":", "-")}Z`;
}
